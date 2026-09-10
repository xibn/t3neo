import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useMessageQueueStore } from "../../messageQueueStore";
import { useThreadShells } from "../../state/entities";
import { notePetTyping, petThreadActivity, usePetActivityStore } from "./petActivity";

/** The thread the user is looking at, from the `/$environmentId/$threadId` route. */
export function activeThreadKeyFromPathname(pathname: string): string | null {
  const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!match || match[1] === "settings" || match[1] === "draft" || match[1] === "projects") {
    return null;
  }
  return scopedThreadKey(scopeThreadRef(match[1]! as never, match[2]! as never));
}

/**
 * Feeds the pet from live app state: running, waiting and failed threads
 * from the shells, the viewed thread from the route, and typing from
 * composer input events. Mount once per window.
 */
export function usePetActivitySync(): void {
  const shells = useThreadShells();
  const queuedByThread = useMessageQueueStore((state) => state.byThread);
  const pausedThreads = useMessageQueueStore((state) => state.pausedThreads);
  const activeThreadKey = useLocation({
    select: (location) => activeThreadKeyFromPathname(location.pathname),
  });

  useEffect(() => {
    const activity = petThreadActivity({
      threads: shells.map((shell) => {
        const key = scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id));
        return {
          key,
          environmentId: shell.environmentId,
          threadId: shell.id,
          title: shell.title,
          status: shell.session?.status,
          latestTurnState: shell.latestTurn?.state,
          hasPendingApprovals: shell.hasPendingApprovals,
          hasPendingUserInput: shell.hasPendingUserInput,
          queuedCount: queuedByThread[key]?.length ?? 0,
        };
      }),
      pausedThreads,
    });
    usePetActivityStore.getState().setActivity(activity, activeThreadKey);
  }, [shells, queuedByThread, pausedThreads, activeThreadKey]);

  useEffect(() => {
    if (activeThreadKey !== null) usePetActivityStore.getState().markSeen(activeThreadKey);
  }, [activeThreadKey]);

  useEffect(() => {
    const onInput = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-chat-composer-form]")) {
        notePetTyping();
      }
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("keydown", onInput, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("keydown", onInput, true);
    };
  }, []);
}
