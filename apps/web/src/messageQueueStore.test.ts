import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { createMemoryStorage } from "./lib/storage";
import {
  isThreadBusyForQueue,
  MESSAGE_QUEUE_STORAGE_KEY,
  queuedMessageThreadKey,
  resetMessageQueueStoreForTest,
  resolveQueuedMessageDispatch,
  useMessageQueueStore,
  type QueuedThreadMessage,
} from "./messageQueueStore";

const environmentId = EnvironmentId.make("env-1");
const threadId = ThreadId.make("thread-1");

function makeMessage(id: string, createdAt: string, thread = threadId): QueuedThreadMessage {
  return {
    id: MessageId.make(id),
    environmentId,
    threadId: thread,
    text: `message ${id}`,
    attachments: [],
    runtimeMode: "full-access",
    interactionMode: "default",
    createdAt,
  };
}

describe("useMessageQueueStore", () => {
  beforeEach(() => {
    resetMessageQueueStoreForTest();
  });

  it("keeps messages in the order they were queued and persists every change", () => {
    const storage = createMemoryStorage();
    resetMessageQueueStoreForTest(storage);
    const store = useMessageQueueStore.getState();

    store.enqueue(makeMessage("b", "2026-09-05T10:00:01.000Z"));
    store.enqueue(makeMessage("a", "2026-09-05T10:00:00.000Z"));
    store.enqueue(makeMessage("other", "2026-09-05T10:00:00.000Z", ThreadId.make("thread-2")));

    const threadKey = queuedMessageThreadKey({ environmentId, threadId });
    expect(useMessageQueueStore.getState().byThread[threadKey]?.map((m) => m.id)).toEqual([
      "b",
      "a",
    ]);

    // A fresh store reads the persisted queue back in the same order.
    resetMessageQueueStoreForTest(storage);
    expect(useMessageQueueStore.getState().byThread[threadKey]?.map((m) => m.id)).toEqual([
      "b",
      "a",
    ]);
    expect(storage.getItem(MESSAGE_QUEUE_STORAGE_KEY)).toContain('"messages"');
  });

  it("reorders one thread's queue without touching other threads", () => {
    const storage = createMemoryStorage();
    resetMessageQueueStoreForTest(storage);
    const store = useMessageQueueStore.getState();
    const otherThread = ThreadId.make("thread-2");
    store.enqueue(makeMessage("a", "2026-09-05T10:00:00.000Z"));
    store.enqueue(makeMessage("x", "2026-09-05T10:00:00.500Z", otherThread));
    store.enqueue(makeMessage("b", "2026-09-05T10:00:01.000Z"));
    store.enqueue(makeMessage("c", "2026-09-05T10:00:02.000Z"));

    const threadKey = queuedMessageThreadKey({ environmentId, threadId });
    const otherKey = queuedMessageThreadKey({ environmentId, threadId: otherThread });
    store.reorderThread(threadKey, [MessageId.make("c"), MessageId.make("a"), MessageId.make("b")]);
    expect(useMessageQueueStore.getState().byThread[threadKey]?.map((m) => m.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(useMessageQueueStore.getState().byThread[otherKey]?.map((m) => m.id)).toEqual(["x"]);
    // The head is what the drain sends next, so the order survives a reload.
    resetMessageQueueStoreForTest(storage);
    expect(useMessageQueueStore.getState().byThread[threadKey]?.[0]?.id).toBe("c");

    // An order that is not exactly the thread's messages is ignored.
    useMessageQueueStore.getState().reorderThread(threadKey, [MessageId.make("a")]);
    useMessageQueueStore
      .getState()
      .reorderThread(threadKey, [MessageId.make("a"), MessageId.make("a"), MessageId.make("b")]);
    expect(useMessageQueueStore.getState().byThread[threadKey]?.map((m) => m.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("marks a single message or a whole thread to send now and clears errors", () => {
    const store = useMessageQueueStore.getState();
    store.enqueue(makeMessage("a", "2026-09-05T10:00:00.000Z"));
    store.enqueue(makeMessage("b", "2026-09-05T10:00:01.000Z"));
    store.setError(MessageId.make("a"), "Provider rejected the turn");

    expect(useMessageQueueStore.getState().messages[0]?.error).toBe("Provider rejected the turn");

    store.markSendNow(MessageId.make("a"));
    const [first, second] = useMessageQueueStore.getState().messages;
    expect(first?.sendNow).toBe(true);
    expect(first?.error).toBeUndefined();
    expect(second?.sendNow).toBeUndefined();

    store.markThreadSendNow(queuedMessageThreadKey({ environmentId, threadId }));
    expect(useMessageQueueStore.getState().messages.every((m) => m.sendNow === true)).toBe(true);
  });

  it("ends a forced send on failure so the message waits for Retry instead of looping", () => {
    const store = useMessageQueueStore.getState();
    store.enqueue(makeMessage("a", "2026-09-05T10:00:00.000Z"));
    store.markSendNow(MessageId.make("a"));
    store.setError(MessageId.make("a"), "Attachment not found");
    const [message] = useMessageQueueStore.getState().messages;
    expect(message?.error).toBe("Attachment not found");
    expect(message?.sendNow).toBeUndefined();
    expect(
      resolveQueuedMessageDispatch({
        message: message!,
        threadExists: true,
        threadBusy: false,
        threadPaused: false,
        shellStatus: "live",
        connected: true,
        inFlight: false,
      }),
    ).toBe("wait");

    // Clearing the error keeps a forced flag that is still set.
    store.markSendNow(MessageId.make("a"));
    store.setError(MessageId.make("a"), null);
    expect(useMessageQueueStore.getState().messages[0]?.sendNow).toBe(true);
  });

  it("removes a message and returns it", () => {
    const store = useMessageQueueStore.getState();
    store.enqueue(makeMessage("a", "2026-09-05T10:00:00.000Z"));

    expect(store.remove(MessageId.make("a"))?.id).toBe("a");
    expect(store.remove(MessageId.make("a"))).toBeNull();
    expect(useMessageQueueStore.getState().messages).toHaveLength(0);
  });

  it("pauses a thread's queue until a direct send or a forced message resumes it", () => {
    const storage = createMemoryStorage();
    resetMessageQueueStoreForTest(storage);
    const store = useMessageQueueStore.getState();
    const first = makeMessage("m1", "2026-01-01T00:00:00.000Z");
    const threadKey = queuedMessageThreadKey(first);
    store.enqueue(first);

    store.pauseThread(threadKey);
    expect(useMessageQueueStore.getState().pausedThreads.has(threadKey)).toBe(true);
    // The pause survives a reload alongside the messages.
    resetMessageQueueStoreForTest(storage);
    expect(useMessageQueueStore.getState().pausedThreads.has(threadKey)).toBe(true);

    useMessageQueueStore.getState().resumeThread(threadKey);
    expect(useMessageQueueStore.getState().pausedThreads.has(threadKey)).toBe(false);

    useMessageQueueStore.getState().pauseThread(threadKey);
    useMessageQueueStore.getState().markSendNow(first.id);
    expect(useMessageQueueStore.getState().pausedThreads.has(threadKey)).toBe(false);

    useMessageQueueStore.getState().pauseThread(threadKey);
    useMessageQueueStore.getState().markThreadSendNow(threadKey);
    expect(useMessageQueueStore.getState().pausedThreads.has(threadKey)).toBe(false);
  });

  it("drops an unreadable persisted payload instead of crashing", () => {
    const storage = createMemoryStorage();
    storage.setItem(MESSAGE_QUEUE_STORAGE_KEY, "{not json");
    resetMessageQueueStoreForTest(storage);
    expect(useMessageQueueStore.getState().messages).toEqual([]);
  });
});

describe("isThreadBusyForQueue", () => {
  const now = "2026-09-05T10:00:10.000Z";
  const session = (status: "running" | "starting" | "ready" | "idle") => ({
    threadId,
    status,
    providerName: null,
    runtimeMode: "full-access" as const,
    activeTurnId: null,
    lastError: null,
    updatedAt: now,
  });

  it("is busy while a turn runs or a session starts", () => {
    expect(
      isThreadBusyForQueue(
        { session: session("running"), latestUserMessageAt: null, latestTurn: null },
        { now },
      ),
    ).toBe(true);
    expect(
      isThreadBusyForQueue(
        { session: session("starting"), latestUserMessageAt: null, latestTurn: null },
        { now },
      ),
    ).toBe(true);
  });

  it("is busy while a just-sent user message waits for a turn to adopt it", () => {
    expect(
      isThreadBusyForQueue(
        {
          session: session("ready"),
          latestUserMessageAt: "2026-09-05T10:00:09.000Z",
          latestTurn: null,
        },
        { now },
      ),
    ).toBe(true);
  });

  it("is idle once the latest turn adopted the message", () => {
    expect(
      isThreadBusyForQueue(
        {
          session: session("ready"),
          latestUserMessageAt: "2026-09-05T10:00:00.000Z",
          latestTurn: {
            turnId: "turn-1" as never,
            state: "completed",
            requestedAt: "2026-09-05T10:00:00.000Z",
            startedAt: "2026-09-05T10:00:01.000Z",
            completedAt: "2026-09-05T10:00:05.000Z",
            assistantMessageId: null,
          },
        },
        { now },
      ),
    ).toBe(false);
  });
});

describe("resolveQueuedMessageDispatch", () => {
  const base = {
    message: {},
    threadExists: true,
    threadBusy: false,
    threadPaused: false,
    shellStatus: "live" as const,
    connected: true,
    inFlight: false,
  };

  it("holds a paused thread's queue unless the user forces a message", () => {
    expect(resolveQueuedMessageDispatch({ ...base, threadPaused: true })).toBe("wait");
    expect(
      resolveQueuedMessageDispatch({ ...base, threadPaused: true, message: { sendNow: true } }),
    ).toBe("send");
  });

  it("sends the head when the thread is idle and connected", () => {
    expect(resolveQueuedMessageDispatch(base)).toBe("send");
  });

  it("waits while the thread is busy, disconnected, or already dispatching", () => {
    expect(resolveQueuedMessageDispatch({ ...base, threadBusy: true })).toBe("wait");
    expect(resolveQueuedMessageDispatch({ ...base, connected: false })).toBe("wait");
    expect(resolveQueuedMessageDispatch({ ...base, inFlight: true })).toBe("wait");
  });

  it("sends a busy thread's message once the user forces it", () => {
    expect(
      resolveQueuedMessageDispatch({ ...base, threadBusy: true, message: { sendNow: true } }),
    ).toBe("send");
    // A forced message still waits for the previous dispatch to land.
    expect(
      resolveQueuedMessageDispatch({ ...base, inFlight: true, message: { sendNow: true } }),
    ).toBe("wait");
  });

  it("parks a failed message until the user retries it", () => {
    expect(resolveQueuedMessageDispatch({ ...base, message: { error: "boom" } })).toBe("wait");
    expect(
      resolveQueuedMessageDispatch({ ...base, message: { error: "boom", sendNow: true } }),
    ).toBe("send");
  });

  it("drops a message only once a live shell proves the thread is gone", () => {
    expect(
      resolveQueuedMessageDispatch({ ...base, threadExists: false, shellStatus: "cached" }),
    ).toBe("wait");
    expect(resolveQueuedMessageDispatch({ ...base, threadExists: false })).toBe("drop");
  });
});
