import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { hasQueuedTurnStart } from "@t3tools/client-runtime/state/thread-settled";
import type { EnvironmentShellStatus } from "@t3tools/client-runtime/state/shell";
import {
  ChatAttachment,
  EnvironmentId,
  MessageId,
  ModelSelection,
  type OrchestrationThreadShell,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";

import { createMemoryStorage, type StateStorage } from "./lib/storage";

export const MESSAGE_QUEUE_STORAGE_KEY = "t3code:message-queue:v1";
const MESSAGE_QUEUE_STORAGE_VERSION = 1;

/**
 * Images sent to servers without upload support ride inline as data URLs.
 * The contract keeps that schema private, so the queue mirrors its shape.
 */
const QueuedInlineImageAttachment = Schema.Struct({
  type: Schema.Literal("image"),
  name: Schema.String,
  mimeType: Schema.String,
  sizeBytes: Schema.Number,
  dataUrl: Schema.String,
});

const QueuedAttachment = Schema.Union([ChatAttachment, QueuedInlineImageAttachment]);
export type QueuedAttachment = typeof QueuedAttachment.Type;

const QueuedThreadMessageSchema = Schema.Struct({
  id: MessageId,
  environmentId: EnvironmentId,
  threadId: ThreadId,
  /** The fully composed outgoing text, exactly what the turn will send. */
  text: Schema.String,
  attachments: Schema.Array(QueuedAttachment),
  modelSelection: Schema.optionalKey(ModelSelection),
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  createdAt: Schema.String,
  /** Set by "Send now": the drain sends even while the thread is busy. */
  sendNow: Schema.optionalKey(Schema.Boolean),
  /** A non-transient send failure; the message waits for the user. */
  error: Schema.optionalKey(Schema.String),
});
export type QueuedThreadMessage = typeof QueuedThreadMessageSchema.Type;

const PersistedMessageQueueState = Schema.Struct({
  messages: Schema.Array(QueuedThreadMessageSchema),
  /** Threads whose queue the user paused by stopping a turn. */
  pausedThreads: Schema.optionalKey(Schema.Array(Schema.String)),
});
const decodePersistedMessageQueueState = Schema.decodeUnknownSync(PersistedMessageQueueState);

interface PersistedQueue {
  readonly messages: ReadonlyArray<QueuedThreadMessage>;
  readonly pausedThreads: ReadonlySet<string>;
}

export function queuedMessageThreadKey(message: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}): string {
  return scopedThreadKey(scopeThreadRef(message.environmentId, message.threadId));
}

const EMPTY_QUEUE: ReadonlyArray<QueuedThreadMessage> = Object.freeze([]);
const EMPTY_PERSISTED_QUEUE: PersistedQueue = { messages: EMPTY_QUEUE, pausedThreads: new Set() };

/** Array order is queue order: enqueue appends and reorderThread rewrites it. */
function groupByThread(
  messages: ReadonlyArray<QueuedThreadMessage>,
): Readonly<Record<string, ReadonlyArray<QueuedThreadMessage>>> {
  const grouped: Record<string, QueuedThreadMessage[]> = {};
  for (const message of messages) {
    (grouped[queuedMessageThreadKey(message)] ??= []).push(message);
  }
  return grouped;
}

function resolveBaseStorage(): StateStorage {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // Storage blocked by policy or sandboxed iframe; fall back to memory.
  }
  return createMemoryStorage();
}

let baseStorage = resolveBaseStorage();

function persistQueue(queue: PersistedQueue): boolean {
  try {
    baseStorage.setItem(
      MESSAGE_QUEUE_STORAGE_KEY,
      JSON.stringify({
        version: MESSAGE_QUEUE_STORAGE_VERSION,
        state: { messages: queue.messages, pausedThreads: [...queue.pausedThreads] },
      }),
    );
    return true;
  } catch (error) {
    console.error("[MESSAGE-QUEUE] Could not persist queued messages (storage quota?).", error);
    return false;
  }
}

function readPersistedQueue(): PersistedQueue {
  try {
    const raw = baseStorage.getItem(MESSAGE_QUEUE_STORAGE_KEY);
    if (typeof raw !== "string" || raw.length === 0) return EMPTY_PERSISTED_QUEUE;
    const parsed: unknown = JSON.parse(raw);
    const state = (parsed as { state?: unknown } | null)?.state;
    if (!state) return EMPTY_PERSISTED_QUEUE;
    // A reload interrupts any send that was in flight; the message is still
    // queued, so it simply goes again once the drain picks it up.
    const decoded = decodePersistedMessageQueueState(state);
    return { messages: decoded.messages, pausedThreads: new Set(decoded.pausedThreads ?? []) };
  } catch {
    return EMPTY_PERSISTED_QUEUE;
  }
}

interface MessageQueueStoreState {
  messages: ReadonlyArray<QueuedThreadMessage>;
  byThread: Readonly<Record<string, ReadonlyArray<QueuedThreadMessage>>>;
  /**
   * Threads whose queue holds after the user stopped a turn. A paused queue
   * waits until the user sends a message directly or forces a queued one;
   * that turn finishing hands control back to the queue.
   */
  pausedThreads: ReadonlySet<string>;
  /** Appends a message behind everything already queued for its thread. */
  enqueue: (message: QueuedThreadMessage) => { durable: boolean };
  remove: (messageId: MessageId) => QueuedThreadMessage | null;
  /** Puts one thread's queue in the given order; the ids must be exactly that thread's messages. */
  reorderThread: (threadKey: string, orderedIds: ReadonlyArray<MessageId>) => void;
  /** Flags one message to send even while its thread is busy. Clears a stale error and the pause. */
  markSendNow: (messageId: MessageId) => void;
  /** Flags every message queued for a thread to send in order without waiting. */
  markThreadSendNow: (threadKey: string) => void;
  setError: (messageId: MessageId, error: string | null) => void;
  pauseThread: (threadKey: string) => void;
  resumeThread: (threadKey: string) => void;
}

function withMessages(
  messages: ReadonlyArray<QueuedThreadMessage>,
  pausedThreads: ReadonlySet<string>,
) {
  persistQueue({ messages, pausedThreads });
  return { messages, byThread: groupByThread(messages), pausedThreads };
}

function withoutPaused(pausedThreads: ReadonlySet<string>, threadKey: string): ReadonlySet<string> {
  if (!pausedThreads.has(threadKey)) return pausedThreads;
  const next = new Set(pausedThreads);
  next.delete(threadKey);
  return next;
}

function forced(message: QueuedThreadMessage): QueuedThreadMessage {
  const { error: _error, ...rest } = message;
  return { ...rest, sendNow: true };
}

function withError(message: QueuedThreadMessage, error: string | null): QueuedThreadMessage {
  const { error: _error, ...rest } = message;
  return error === null ? rest : { ...rest, error };
}

export const useMessageQueueStore = create<MessageQueueStoreState>()((set, get) => {
  const initial = readPersistedQueue();
  return {
    messages: initial.messages,
    byThread: groupByThread(initial.messages),
    pausedThreads: initial.pausedThreads,
    enqueue: (message) => {
      const messages = [...get().messages.filter((entry) => entry.id !== message.id), message];
      const pausedThreads = get().pausedThreads;
      const durable = persistQueue({ messages, pausedThreads });
      set({ messages, byThread: groupByThread(messages), pausedThreads });
      return { durable };
    },
    remove: (messageId) => {
      const existing = get().messages.find((entry) => entry.id === messageId) ?? null;
      if (!existing) return null;
      set(
        withMessages(
          get().messages.filter((entry) => entry.id !== messageId),
          get().pausedThreads,
        ),
      );
      return existing;
    },
    reorderThread: (threadKey, orderedIds) => {
      const messages = get().messages;
      const inThread = messages.filter((entry) => queuedMessageThreadKey(entry) === threadKey);
      const byId = new Map(inThread.map((entry) => [entry.id, entry]));
      if (
        orderedIds.length !== inThread.length ||
        new Set(orderedIds).size !== orderedIds.length ||
        orderedIds.some((id) => !byId.has(id))
      ) {
        return;
      }
      let next = 0;
      const reordered = messages.map((entry) =>
        queuedMessageThreadKey(entry) === threadKey ? byId.get(orderedIds[next++]!)! : entry,
      );
      set(withMessages(reordered, get().pausedThreads));
    },
    markSendNow: (messageId) => {
      const target = get().messages.find((entry) => entry.id === messageId);
      if (!target) return;
      set(
        withMessages(
          get().messages.map((entry) => (entry.id === messageId ? forced(entry) : entry)),
          withoutPaused(get().pausedThreads, queuedMessageThreadKey(target)),
        ),
      );
    },
    markThreadSendNow: (threadKey) => {
      set(
        withMessages(
          get().messages.map((entry) =>
            queuedMessageThreadKey(entry) === threadKey ? forced(entry) : entry,
          ),
          withoutPaused(get().pausedThreads, threadKey),
        ),
      );
    },
    setError: (messageId, error) => {
      set(
        withMessages(
          get().messages.map((entry) => (entry.id === messageId ? withError(entry, error) : entry)),
          get().pausedThreads,
        ),
      );
    },
    pauseThread: (threadKey) => {
      if (get().pausedThreads.has(threadKey)) return;
      set(withMessages(get().messages, new Set([...get().pausedThreads, threadKey])));
    },
    resumeThread: (threadKey) => {
      const pausedThreads = withoutPaused(get().pausedThreads, threadKey);
      if (pausedThreads === get().pausedThreads) return;
      set(withMessages(get().messages, pausedThreads));
    },
  };
});

export function useQueuedThreadMessages(
  threadKey: string | null,
): ReadonlyArray<QueuedThreadMessage> {
  return useMessageQueueStore((state) =>
    threadKey === null ? EMPTY_QUEUE : (state.byThread[threadKey] ?? EMPTY_QUEUE),
  );
}

export function useQueuedThreadPaused(threadKey: string | null): boolean {
  return useMessageQueueStore((state) =>
    threadKey === null ? false : state.pausedThreads.has(threadKey),
  );
}

/**
 * A thread is busy for queueing purposes while a turn runs, while a session
 * starts, or while a sent user message is still waiting for a turn to adopt
 * it. The last case covers the gap right after a dispatch, so back-to-back
 * queued messages never steer each other.
 */
export function isThreadBusyForQueue(
  shell: Pick<OrchestrationThreadShell, "session" | "latestUserMessageAt" | "latestTurn">,
  options: { readonly now: string },
): boolean {
  const status = shell.session?.status;
  if (status === "running" || status === "starting") return true;
  return hasQueuedTurnStart(shell, options);
}

export type QueuedMessageDispatchDecision = "wait" | "send" | "drop";

/**
 * Decides what the drain does with the head of a thread's queue. Only the
 * head is ever considered: later messages wait behind it so order holds.
 */
export function resolveQueuedMessageDispatch(input: {
  readonly message: Pick<QueuedThreadMessage, "sendNow" | "error">;
  readonly threadExists: boolean;
  readonly threadBusy: boolean;
  /** The user stopped a turn; only a forced message or a direct send resumes the queue. */
  readonly threadPaused: boolean;
  readonly shellStatus: EnvironmentShellStatus;
  readonly connected: boolean;
  readonly inFlight: boolean;
}): QueuedMessageDispatchDecision {
  if (!input.connected) return "wait";
  if (!input.threadExists) {
    // Only a live shell proves the thread is gone; a cached or synchronizing
    // shell may simply not list it yet.
    return input.shellStatus === "live" ? "drop" : "wait";
  }
  if (input.inFlight) return "wait";
  if (input.message.error !== undefined && !input.message.sendNow) return "wait";
  if (input.message.sendNow) return "send";
  if (input.threadPaused) return "wait";
  return input.threadBusy ? "wait" : "send";
}

/** Test-only: swap the backing storage and reload the store from it. */
export function resetMessageQueueStoreForTest(storage?: StateStorage): void {
  baseStorage = storage ?? createMemoryStorage();
  const { messages, pausedThreads } = readPersistedQueue();
  useMessageQueueStore.setState({ messages, byThread: groupByThread(messages), pausedThreads });
}
