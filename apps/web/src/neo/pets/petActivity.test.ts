import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  petBadgeFor,
  petMoodFor,
  petRunningThreads,
  petThreadActivity,
  usePetActivityStore,
  type PetThread,
  type PetThreadShell,
} from "./petActivity";

const thread = (id: string): PetThread => ({
  key: `env:${id}`,
  environmentId: "env",
  threadId: id,
  title: `Thread ${id}`,
});

const shell = (id: string, overrides: Partial<PetThreadShell> = {}): PetThreadShell => ({
  ...thread(id),
  status: "idle",
  latestTurnState: "completed",
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  queuedCount: 0,
  ...overrides,
});

const quiet = { running: [], waiting: [], failedKeys: new Set<string>() };

describe("pet activity", () => {
  beforeEach(() => {
    usePetActivityStore.setState({
      typing: false,
      running: [],
      waiting: [],
      unseenCompleted: [],
      unseenFailed: [],
    });
  });

  it("counts live turns and pending queues as work, but not a paused queue", () => {
    const running = petRunningThreads({
      threads: [
        shell("live", { status: "running" }),
        shell("queued", { queuedCount: 2 }),
        shell("paused", { queuedCount: 2 }),
        shell("idle"),
        shell("paused-live", { status: "running", queuedCount: 1 }),
      ],
      pausedThreads: new Set(["env:paused", "env:paused-live"]),
    });
    expect(running.map((entry) => entry.threadId)).toEqual(["live", "queued", "paused-live"]);
    expect(running[0]).toEqual(thread("live"));
  });

  it("reads waiting and failed threads from the shells like Codex reads its session", () => {
    const activity = petThreadActivity({
      threads: [
        shell("approval", { status: "running", hasPendingApprovals: true }),
        shell("question", { hasPendingUserInput: true }),
        shell("broken", { latestTurnState: "error" }),
        shell("crashed", { status: "error" }),
        shell("fine", { status: "running" }),
      ],
      pausedThreads: new Set(),
    });
    expect(activity.running.map((entry) => entry.threadId)).toEqual(["approval", "fine"]);
    expect(activity.waiting.map((entry) => entry.threadId)).toEqual(["approval", "question"]);
    expect([...activity.failedKeys]).toEqual(["env:broken", "env:crashed"]);
  });

  it("derives the mood in Codex's order: typing, needs input, running, blocked, ready", () => {
    expect(petMoodFor({ typing: false, running: [] })).toBe("idle");
    expect(petMoodFor({ typing: false, running: [thread("a")] })).toBe("working");
    expect(petMoodFor({ typing: true, running: [thread("a")] })).toBe("typing");
    expect(petMoodFor({ typing: false, running: [thread("a")], waiting: [thread("a")] })).toBe(
      "waiting",
    );
    expect(petMoodFor({ typing: false, running: [], unseenCompleted: [thread("a")] })).toBe("done");
    expect(
      petMoodFor({
        typing: false,
        running: [],
        unseenCompleted: [thread("a")],
        unseenFailed: [thread("b")],
      }),
    ).toBe("failed");
    expect(petMoodFor({ typing: false, running: [thread("b")], unseenFailed: [thread("a")] })).toBe(
      "working",
    );
  });

  it("remembers threads that finished or failed while not being viewed", () => {
    const store = usePetActivityStore.getState();
    store.setActivity({ ...quiet, running: [thread("a"), thread("b"), thread("c")] }, null);
    store.setActivity({ ...quiet, running: [thread("b")], failedKeys: new Set(["env:c"]) }, null);
    expect(usePetActivityStore.getState().unseenCompleted.map((t) => t.threadId)).toEqual(["a"]);
    expect(usePetActivityStore.getState().unseenFailed.map((t) => t.threadId)).toEqual(["c"]);

    // The viewed thread finishing is seen at once; a rerun clears the old outcome.
    usePetActivityStore.getState().setActivity({ ...quiet, running: [thread("c")] }, "env:b");
    expect(usePetActivityStore.getState().unseenFailed).toEqual([]);
    expect(usePetActivityStore.getState().unseenCompleted.map((t) => t.threadId)).toEqual(["a"]);

    usePetActivityStore.getState().markSeen("env:a");
    expect(usePetActivityStore.getState().unseenCompleted).toEqual([]);
  });

  it("shows a count while running, a check once something finished or failed unseen", () => {
    expect(petBadgeFor({ running: [thread("a")], unseenCompleted: [thread("b")] })).toEqual({
      kind: "count",
      count: 1,
    });
    expect(petBadgeFor({ running: [], unseenCompleted: [thread("b")] })).toEqual({ kind: "done" });
    expect(petBadgeFor({ running: [], unseenCompleted: [], unseenFailed: [thread("b")] })).toEqual({
      kind: "done",
    });
    expect(petBadgeFor({ running: [], unseenCompleted: [] })).toEqual({ kind: "count", count: 0 });
  });
});
