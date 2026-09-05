import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  petBadgeFor,
  petMoodFor,
  petRunningThreads,
  usePetActivityStore,
  type PetRunningThread,
} from "./petActivity";

const thread = (id: string): PetRunningThread => ({
  key: `env:${id}`,
  environmentId: "env",
  threadId: id,
  title: `Thread ${id}`,
});

describe("pet activity", () => {
  beforeEach(() => {
    usePetActivityStore.setState({ typing: false, running: [], unseenCompleted: [] });
  });

  it("counts live turns and pending queues as work, but not a paused queue", () => {
    const shell = (id: string, status: string | undefined, queuedCount: number) => ({
      ...thread(id),
      status,
      queuedCount,
    });
    const running = petRunningThreads({
      threads: [
        shell("live", "running", 0),
        shell("queued", "idle", 2),
        shell("paused", "idle", 2),
        shell("idle", "idle", 0),
        shell("paused-live", "running", 1),
      ],
      pausedThreads: new Set(["env:paused", "env:paused-live"]),
    });
    expect(running.map((entry) => entry.threadId)).toEqual(["live", "queued", "paused-live"]);
    expect(running[0]).toEqual(thread("live"));
  });

  it("derives the mood from typing first, then running work", () => {
    expect(petMoodFor({ typing: false, running: [] })).toBe("idle");
    expect(petMoodFor({ typing: false, running: [thread("a")] })).toBe("working");
    expect(petMoodFor({ typing: true, running: [thread("a")] })).toBe("typing");
  });

  it("remembers threads that finished while not being viewed", () => {
    const store = usePetActivityStore.getState();
    store.setRunning([thread("a"), thread("b")], null);
    store.setRunning([thread("b")], null);
    expect(usePetActivityStore.getState().unseenCompleted.map((t) => t.threadId)).toEqual(["a"]);

    // Finishing while the user looks at it needs no reminder.
    store.setRunning([], "env:b");
    expect(usePetActivityStore.getState().unseenCompleted.map((t) => t.threadId)).toEqual(["a"]);

    store.markSeen("env:a");
    expect(usePetActivityStore.getState().unseenCompleted).toEqual([]);
  });

  it("drops the reminder once the thread runs again", () => {
    const store = usePetActivityStore.getState();
    store.setRunning([thread("a")], null);
    store.setRunning([], null);
    store.setRunning([thread("a")], null);
    expect(usePetActivityStore.getState().unseenCompleted).toEqual([]);
  });

  it("shows a count while working, a dot after unseen completion, nothing otherwise", () => {
    expect(petBadgeFor({ running: [thread("a"), thread("b")], unseenCompleted: [] })).toEqual({
      kind: "count",
      count: 2,
    });
    expect(petBadgeFor({ running: [], unseenCompleted: [thread("a")] })).toEqual({ kind: "done" });
    expect(petBadgeFor({ running: [], unseenCompleted: [] })).toEqual({ kind: "count", count: 0 });
  });
});
