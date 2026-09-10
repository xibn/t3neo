/**
 * What the pet reacts to, in Codex's terms: threads with an agent running,
 * threads waiting on the user (an approval or a question), and threads whose
 * last turn failed or finished while nobody looked. Plus whether the user is
 * typing in the composer. Kept in memory per window; the desktop pet window
 * reads thread state itself and hears about typing over the broadcast
 * channel below.
 */

import { create } from "zustand";

import type { PetMood } from "./petRegistry";

export interface PetThread {
  readonly key: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
}

/** Kept under its old name for the callers that only ever meant running threads. */
export type PetRunningThread = PetThread;

export interface PetActivitySnapshot {
  readonly typing: boolean;
  readonly running: ReadonlyArray<PetThread>;
  /** Threads that need an approval or an answer before they go on. */
  readonly waiting: ReadonlyArray<PetThread>;
  readonly unseenCompleted: ReadonlyArray<PetThread>;
  readonly unseenFailed: ReadonlyArray<PetThread>;
}

export interface PetThreadActivity {
  readonly running: ReadonlyArray<PetThread>;
  readonly waiting: ReadonlyArray<PetThread>;
  /** Threads whose latest turn ended in an error; a run that ends in one of these is a failure. */
  readonly failedKeys: ReadonlySet<string>;
}

interface PetActivityStore extends PetActivitySnapshot {
  setTyping: (typing: boolean) => void;
  /** Replaces the live picture; threads that stopped running are remembered as finished or failed. */
  setActivity: (activity: PetThreadActivity, activeThreadKey: string | null) => void;
  markSeen: (key: string) => void;
  clearUnseen: () => void;
  replaceSnapshot: (snapshot: PetActivitySnapshot) => void;
}

function without(threads: ReadonlyArray<PetThread>, keys: ReadonlySet<string>): PetThread[] {
  return threads.filter((thread) => !keys.has(thread.key));
}

function append(
  threads: ReadonlyArray<PetThread>,
  additions: ReadonlyArray<PetThread>,
): PetThread[] {
  const known = new Set(threads.map((thread) => thread.key));
  return [...threads, ...additions.filter((thread) => !known.has(thread.key))];
}

export const usePetActivityStore = create<PetActivityStore>()((set, get) => ({
  typing: false,
  running: [],
  waiting: [],
  unseenCompleted: [],
  unseenFailed: [],
  setTyping: (typing) => {
    if (get().typing !== typing) set({ typing });
  },
  setActivity: ({ running, waiting, failedKeys }, activeThreadKey) => {
    const previous = get().running;
    const runningKeys = new Set(running.map((thread) => thread.key));
    const finished = previous.filter(
      (thread) => !runningKeys.has(thread.key) && thread.key !== activeThreadKey,
    );
    // A thread that runs again drops out of the "look at me" lists.
    const unseenCompleted = append(
      without(get().unseenCompleted, runningKeys),
      finished.filter((thread) => !failedKeys.has(thread.key)),
    );
    const unseenFailed = append(
      without(get().unseenFailed, runningKeys),
      finished.filter((thread) => failedKeys.has(thread.key)),
    );
    set({ running, waiting, unseenCompleted, unseenFailed });
  },
  markSeen: (key) => {
    const { unseenCompleted, unseenFailed } = get();
    if (
      !unseenCompleted.some((thread) => thread.key === key) &&
      !unseenFailed.some((thread) => thread.key === key)
    ) {
      return;
    }
    set({
      unseenCompleted: unseenCompleted.filter((thread) => thread.key !== key),
      unseenFailed: unseenFailed.filter((thread) => thread.key !== key),
    });
  },
  clearUnseen: () => {
    if (get().unseenCompleted.length > 0 || get().unseenFailed.length > 0) {
      set({ unseenCompleted: [], unseenFailed: [] });
    }
  },
  replaceSnapshot: (snapshot) => set(snapshot),
}));

export interface PetThreadShell {
  readonly key: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
  readonly status: string | undefined;
  readonly latestTurnState: string | undefined;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly queuedCount: number;
}

/**
 * Threads the pet counts as working: those with a live turn, plus those whose
 * queue will start one shortly. A paused queue is not about to run, so the
 * pet dozes off there like on any other idle thread.
 */
export function petRunningThreads(input: {
  readonly threads: ReadonlyArray<
    Pick<PetThreadShell, "key" | "environmentId" | "threadId" | "title" | "status" | "queuedCount">
  >;
  readonly pausedThreads: ReadonlySet<string>;
}): PetThread[] {
  const running: PetThread[] = [];
  for (const thread of input.threads) {
    const live = thread.status === "running" || thread.status === "starting";
    const queued = thread.queuedCount > 0 && !input.pausedThreads.has(thread.key);
    if (!live && !queued) continue;
    running.push({
      key: thread.key,
      environmentId: thread.environmentId,
      threadId: thread.threadId,
      title: thread.title,
    });
  }
  return running;
}

/** The full live picture from the thread shells, the way Codex reads its own session. */
export function petThreadActivity(input: {
  readonly threads: ReadonlyArray<PetThreadShell>;
  readonly pausedThreads: ReadonlySet<string>;
}): PetThreadActivity {
  const waiting: PetThread[] = [];
  const failedKeys = new Set<string>();
  for (const thread of input.threads) {
    if (thread.hasPendingApprovals || thread.hasPendingUserInput) {
      waiting.push({
        key: thread.key,
        environmentId: thread.environmentId,
        threadId: thread.threadId,
        title: thread.title,
      });
    }
    if (thread.latestTurnState === "error" || thread.status === "error") {
      failedKeys.add(thread.key);
    }
  }
  return { running: petRunningThreads(input), waiting, failedKeys };
}

/**
 * The one mood the pet shows. Typing wins for the pets that watch the user;
 * after that the order is Codex's: a thread that needs you, then work in
 * motion, then a failure or a result nobody has looked at yet.
 */
export function petMoodFor(
  snapshot: Pick<PetActivitySnapshot, "typing" | "running"> &
    Partial<Pick<PetActivitySnapshot, "waiting" | "unseenCompleted" | "unseenFailed">>,
): PetMood {
  if (snapshot.typing) return "typing";
  if ((snapshot.waiting?.length ?? 0) > 0) return "waiting";
  if (snapshot.running.length > 0) return "working";
  if ((snapshot.unseenFailed?.length ?? 0) > 0) return "failed";
  if ((snapshot.unseenCompleted?.length ?? 0) > 0) return "done";
  return "idle";
}

/** The count pill reads 0 when nothing runs and nothing waits, so it is always there. */
export type PetBadge =
  | { readonly kind: "count"; readonly count: number }
  | { readonly kind: "done" };

/** Discord-style badge: a count while agents work, a filled check when work finished unseen. */
export function petBadgeFor(
  snapshot: Pick<PetActivitySnapshot, "running" | "unseenCompleted"> &
    Partial<Pick<PetActivitySnapshot, "unseenFailed">>,
): PetBadge {
  if (snapshot.running.length > 0) return { kind: "count", count: snapshot.running.length };
  if (snapshot.unseenCompleted.length > 0 || (snapshot.unseenFailed?.length ?? 0) > 0) {
    return { kind: "done" };
  }
  return { kind: "count", count: 0 };
}

const TYPING_IDLE_MS = 1_800;
/** Keystrokes come fast; the other windows only need to hear about them now and then. */
const TYPING_BROADCAST_MIN_INTERVAL_MS = 400;
const TYPING_CHANNEL_NAME = "t3code:neo-pet-typing";
let typingTimer: ReturnType<typeof setTimeout> | null = null;
let lastTypingBroadcastAt = 0;

/**
 * Typing happens in the main window, but the pet lives in its own window on
 * desktop. Every window shares this channel: whoever sees a keystroke tells
 * the others, so the pet looks up wherever the typing happens.
 */
const typingChannel: BroadcastChannel | null =
  typeof BroadcastChannel === "function" ? new BroadcastChannel(TYPING_CHANNEL_NAME) : null;

typingChannel?.addEventListener("message", () => {
  markPetTyping();
});

function markPetTyping(): void {
  usePetActivityStore.getState().setTyping(true);
  if (typingTimer !== null) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    typingTimer = null;
    usePetActivityStore.getState().setTyping(false);
  }, TYPING_IDLE_MS);
}

/** Called on every composer keystroke; typing ends after a short pause. */
export function notePetTyping(): void {
  markPetTyping();
  const now = Date.now();
  if (typingChannel && now - lastTypingBroadcastAt >= TYPING_BROADCAST_MIN_INTERVAL_MS) {
    lastTypingBroadcastAt = now;
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
    typingChannel.postMessage("typing");
  }
}
