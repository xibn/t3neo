import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { isTransportConnectionErrorMessage } from "@t3tools/client-runtime/errors";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ModelSelection } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import {
  isThreadBusyForQueue,
  queuedMessageThreadKey,
  resolveQueuedMessageDispatch,
  useMessageQueueStore,
  type QueuedThreadMessage,
} from "../messageQueueStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { useThreadShells } from "../state/entities";
import { useEnvironments } from "../state/environments";
import { environmentShell } from "../state/shell";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";

/**
 * A dispatched turn normally shows up on the thread shell within a second.
 * Past this bound the shell update is considered lost and the queue moves on
 * rather than stalling forever; mirrors the queued-turn-start grace window.
 */
const DISPATCH_ACK_GRACE_MS = 2 * 60 * 1_000;
const TRANSIENT_RETRY_MS = 3_000;

interface InFlightDispatch {
  readonly messageId: QueuedThreadMessage["id"];
  /** The turn's createdAt; the shell's latestUserMessageAt reaches it on adoption. */
  readonly createdAt: string;
  readonly startedAtMs: number;
}

function modelSelectionsEqual(left: ModelSelection, right: ModelSelection): boolean {
  return (
    left.instanceId === right.instanceId &&
    left.model === right.model &&
    JSON.stringify(left.options ?? null) === JSON.stringify(right.options ?? null)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to send the queued message.";
}

/**
 * Sends queued messages one thread at a time, in order, whenever their thread
 * stops being busy (or the user forced one). Mounted once at the app root so
 * queues drain even while the user is on another thread or in Settings.
 */
export function useMessageQueueDrain(): void {
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const setRuntimeMode = useAtomCommand(threadEnvironment.setRuntimeMode, {
    reportFailure: false,
  });
  const setInteractionMode = useAtomCommand(threadEnvironment.setInteractionMode, {
    reportFailure: false,
  });
  const byThread = useMessageQueueStore((state) => state.byThread);
  const pausedThreads = useMessageQueueStore((state) => state.pausedThreads);
  const threads = useThreadShells();
  const { presentationById } = useEnvironments();
  const [retryTick, setRetryTick] = useState(0);
  const inFlightRef = useRef(new Map<string, InFlightDispatch>());
  const retryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = retryTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const threadKeys = Object.keys(byThread);
    if (threadKeys.length === 0) {
      return;
    }
    const bump = (threadKey: string, delayMs: number) => {
      const existing = retryTimersRef.current.get(threadKey);
      if (existing !== undefined) {
        clearTimeout(existing);
      }
      retryTimersRef.current.set(
        threadKey,
        setTimeout(() => {
          retryTimersRef.current.delete(threadKey);
          setRetryTick((current) => current + 1);
        }, delayMs),
      );
    };

    const shellsByKey = new Map<string, EnvironmentThreadShell>();
    for (const thread of threads) {
      shellsByKey.set(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread);
    }
    const now = new Date().toISOString();
    const nowMs = Date.now();
    const store = useMessageQueueStore.getState();

    for (const threadKey of threadKeys) {
      const head = byThread[threadKey]?.[0];
      if (!head) continue;
      const shell = shellsByKey.get(threadKey);

      const inFlight = inFlightRef.current.get(threadKey);
      if (inFlight) {
        const acknowledged =
          shell?.latestUserMessageAt != null &&
          Date.parse(shell.latestUserMessageAt) >= Date.parse(inFlight.createdAt);
        const expired = nowMs - inFlight.startedAtMs > DISPATCH_ACK_GRACE_MS;
        if (acknowledged || expired) {
          inFlightRef.current.delete(threadKey);
        } else {
          bump(threadKey, DISPATCH_ACK_GRACE_MS - (nowMs - inFlight.startedAtMs) + 1);
          continue;
        }
      }

      const decision = resolveQueuedMessageDispatch({
        message: head,
        threadExists: shell !== undefined,
        threadBusy: shell !== undefined && isThreadBusyForQueue(shell, { now }),
        threadPaused: pausedThreads.has(threadKey),
        shellStatus: appAtomRegistry.get(environmentShell.stateValueAtom(head.environmentId))
          .status,
        connected: presentationById.get(head.environmentId)?.connection.phase === "connected",
        inFlight: false,
      });
      if (decision === "drop") {
        store.remove(head.id);
        continue;
      }
      if (decision === "wait" || shell === undefined) {
        continue;
      }

      const createdAt = new Date().toISOString();
      inFlightRef.current.set(threadKey, {
        messageId: head.id,
        createdAt,
        startedAtMs: Date.now(),
      });
      void dispatchQueuedMessage(head, shell, createdAt).then((outcome) => {
        if (outcome === "sent") {
          useMessageQueueStore.getState().remove(head.id);
          return;
        }
        inFlightRef.current.delete(threadKey);
        if (outcome === "retry") {
          bump(threadKey, TRANSIENT_RETRY_MS);
        }
      });
    }

    async function dispatchQueuedMessage(
      message: QueuedThreadMessage,
      thread: EnvironmentThreadShell,
      createdAt: string,
    ): Promise<"sent" | "retry" | "failed"> {
      const { environmentId, threadId } = message;
      const fail = (result: Extract<AtomCommandResult<unknown, unknown>, { _tag: "Failure" }>) => {
        if (isAtomCommandInterrupted(result)) return "retry" as const;
        const text = errorMessage(squashAtomCommandFailure(result));
        if (isTransportConnectionErrorMessage(text)) return "retry" as const;
        useMessageQueueStore.getState().setError(message.id, text);
        return "failed" as const;
      };

      if (
        message.modelSelection !== undefined &&
        !modelSelectionsEqual(message.modelSelection, thread.modelSelection)
      ) {
        const result = await updateMetadata({
          environmentId,
          input: { threadId, modelSelection: message.modelSelection },
        });
        if (result._tag === "Failure") return fail(result);
      }
      if (message.runtimeMode !== thread.runtimeMode) {
        const result = await setRuntimeMode({
          environmentId,
          input: { threadId, runtimeMode: message.runtimeMode, createdAt },
        });
        if (result._tag === "Failure") return fail(result);
      }
      if (message.interactionMode !== thread.interactionMode) {
        const result = await setInteractionMode({
          environmentId,
          input: { threadId, interactionMode: message.interactionMode, createdAt },
        });
        if (result._tag === "Failure") return fail(result);
      }
      const result = await startTurn({
        environmentId,
        input: {
          threadId,
          message: {
            messageId: message.id,
            role: "user",
            text: message.text,
            attachments: message.attachments,
          },
          ...(message.modelSelection !== undefined
            ? { modelSelection: message.modelSelection }
            : {}),
          runtimeMode: message.runtimeMode,
          interactionMode: message.interactionMode,
          createdAt,
        },
      });
      return result._tag === "Failure" ? fail(result) : "sent";
    }
  }, [
    byThread,
    pausedThreads,
    presentationById,
    retryTick,
    setInteractionMode,
    setRuntimeMode,
    startTurn,
    threads,
    updateMetadata,
  ]);

  // Queued messages for a thread that vanished from the store (discarded) must
  // not keep an in-flight marker around that would block a later re-queue.
  useEffect(() => {
    for (const threadKey of inFlightRef.current.keys()) {
      if (!(threadKey in byThread)) {
        inFlightRef.current.delete(threadKey);
      }
    }
  }, [byThread]);
}

export { queuedMessageThreadKey };
