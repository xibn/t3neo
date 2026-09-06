/**
 * What the pet reacts to: whether the user is typing in the composer, which
 * threads have agents working, and which finished while nobody looked. Kept
 * in memory; the desktop pet window receives the same picture over IPC.
 */

import { create } from "zustand";

import type { PetMood } from "./petRegistry";

export interface PetRunningThread {
  readonly key: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
}

export interface PetActivitySnapshot {
  readonly typing: boolean;
  readonly running: ReadonlyArray<PetRunningThread>;
  readonly unseenCompleted: ReadonlyArray<PetRunningThread>;
}

interface PetActivityStore extends PetActivitySnapshot {
  setTyping: (typing: boolean) => void;
  /** Replaces the running set; threads that left it are remembered as completed. */
  setRunning: (running: ReadonlyArray<PetRunningThread>, activeThreadKey: string | null) => void;
  markSeen: (key: string) => void;
  clearUnseen: () => void;
  replaceSnapshot: (snapshot: PetActivitySnapshot) => void;
}

export const usePetActivityStore = create<PetActivityStore>()((set, get) => ({
  typing: false,
  running: [],
  unseenCompleted: [],
  setTyping: (typing) => {
    if (get().typing !== typing) set({ typing });
  },
  setRunning: (running, activeThreadKey) => {
    const previous = get().running;
    const nextKeys = new Set(running.map((thread) => thread.key));
    const finished = previous.filter(
      (thread) => !nextKeys.has(thread.key) && thread.key !== activeThreadKey,
    );
    const unseen = finished.length
      ? [
          ...get().unseenCompleted.filter((thread) => !nextKeys.has(thread.key)),
          ...finished.filter(
            (thread) => !get().unseenCompleted.some((entry) => entry.key === thread.key),
          ),
        ]
      : get().unseenCompleted.filter((thread) => !nextKeys.has(thread.key));
    set({ running, unseenCompleted: unseen });
  },
  markSeen: (key) => {
    if (!get().unseenCompleted.some((thread) => thread.key === key)) return;
    set({ unseenCompleted: get().unseenCompleted.filter((thread) => thread.key !== key) });
  },
  clearUnseen: () => {
    if (get().unseenCompleted.length > 0) set({ unseenCompleted: [] });
  },
  replaceSnapshot: (snapshot) => set(snapshot),
}));

/**
 * Threads the pet counts as working: those with a live turn, plus those whose
 * queue will start one shortly. A paused queue is not about to run, so the
 * pet dozes off there like on any other idle thread.
 */
export function petRunningThreads(input: {
  readonly threads: ReadonlyArray<{
    readonly key: string;
    readonly environmentId: string;
    readonly threadId: string;
    readonly title: string;
    readonly status: string | undefined;
    readonly queuedCount: number;
  }>;
  readonly pausedThreads: ReadonlySet<string>;
}): PetRunningThread[] {
  const running: PetRunningThread[] = [];
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

export function petMoodFor(
  snapshot: Pick<PetActivitySnapshot, "typing" | "running"> &
    Partial<Pick<PetActivitySnapshot, "unseenCompleted">>,
): PetMood {
  if (snapshot.typing) return "typing";
  if (snapshot.running.length > 0) return "working";
  if ((snapshot.unseenCompleted?.length ?? 0) > 0) return "done";
  return "idle";
}

/** The count pill reads 0 when nothing runs and nothing waits, so it is always there. */
export type PetBadge =
  | { readonly kind: "count"; readonly count: number }
  | { readonly kind: "done" };

/** Discord-style badge: a count while agents work, a filled dot when work finished unseen. */
export function petBadgeFor(
  snapshot: Pick<PetActivitySnapshot, "running" | "unseenCompleted">,
): PetBadge {
  if (snapshot.running.length > 0) return { kind: "count", count: snapshot.running.length };
  if (snapshot.unseenCompleted.length > 0) return { kind: "done" };
  return { kind: "count", count: 0 };
}

const TYPING_IDLE_MS = 1_800;
let typingTimer: ReturnType<typeof setTimeout> | null = null;

/** Called on every composer keystroke; typing ends after a short pause. */
export function notePetTyping(): void {
  usePetActivityStore.getState().setTyping(true);
  if (typingTimer !== null) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    typingTimer = null;
    usePetActivityStore.getState().setTyping(false);
  }, TYPING_IDLE_MS);
}
