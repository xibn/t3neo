import {
  ArrowDownNarrowWideIcon,
  ArrowUpNarrowWideIcon,
  CheckIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { memo, useCallback, useRef, useState, type PointerEvent } from "react";

import { NEO_PRODUCT_NAME } from "../neoRepository";
import { useNeoSettings } from "../neoSettings";
import { useImportedPet } from "./importedPets";
import { petBadgeFor, petMoodFor, usePetActivityStore, type PetRunningThread } from "./petActivity";
import { petDefinition } from "./petRegistry";
import { PetSprite } from "./PetSprite";
import { usePetActivitySync } from "./usePetActivitySync";

const DRAG_THRESHOLD_PX = 4;

/**
 * The pet in its own desktop window, sized from settings. A bubble above it
 * names one run (the first running thread, else a finished one waiting to be
 * seen); round pills below always show the running count (0 when idle) and a
 * fold toggle that decides whether the bubble lists every run or just one.
 * The toggle is always live; its choice sticks across quiet spells, so the
 * controls never jump and the list never fills the screen on its own.
 * Dragging the pet moves the window; a click brings the main window forward.
 */
export const PetWidget = memo(function PetWidget() {
  usePetActivitySync();
  const { pet, petSize, petWorkingIntervalSec } = useNeoSettings();
  const typing = usePetActivityStore((state) => state.typing);
  const running = usePetActivityStore((state) => state.running);
  const unseenCompleted = usePetActivityStore((state) => state.unseenCompleted);
  const importedPet = useImportedPet(pet);
  const [expanded, setExpanded] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastScreenX: number;
    lastScreenY: number;
    moved: boolean;
  } | null>(null);

  const mood = petMoodFor({ typing, running, unseenCompleted });
  const badge = petBadgeFor({ running, unseenCompleted });

  /** List entries open their thread in the main window; the pet itself never navigates. */
  const openThread = useCallback((thread: PetRunningThread) => {
    usePetActivityStore.getState().clearUnseen();
    void window.desktopBridge?.pet?.focusMain({
      environmentId: thread.environmentId,
      threadId: thread.threadId,
    });
  }, []);
  /** A click on the pet only reveals the main window; unseen work stays marked until opened. */
  const revealApp = useCallback(() => {
    void window.desktopBridge?.pet?.focusMain(null);
  }, []);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);
  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // The window moves itself: forward screen-space deltas.
    const dx = event.screenX - drag.lastScreenX;
    const dy = event.screenY - drag.lastScreenY;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    drag.moved = true;
    drag.lastScreenX = event.screenX;
    drag.lastScreenY = event.screenY;
    if (dx !== 0 || dy !== 0) void window.desktopBridge?.pet?.moveWindow({ dx, dy });
  }, []);
  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      if (!drag.moved) revealApp();
    },
    [revealApp],
  );

  if (pet === "none") return null;

  const listItems: Array<{ thread: PetRunningThread; state: "running" | "done" }> = [
    ...running.map((thread) => ({ thread, state: "running" as const })),
    ...unseenCompleted.map((thread) => ({ thread, state: "done" as const })),
  ];
  const label = importedPet?.name ?? petDefinition(pet).label;
  const shownItems = expanded ? listItems : listItems.slice(0, 1);

  return (
    <div className="neo-pet-widget neo-pet-widget-window" data-neo-pet={pet} data-mood={mood}>
      {shownItems.length > 0 ? (
        <div className="neo-pet-bubble" data-side="start" role="group" aria-label="Agent activity">
          {shownItems.map(({ thread, state }) => (
            <button
              key={thread.key}
              type="button"
              className="neo-pet-bubble-item"
              onClick={() => openThread(thread)}
            >
              <span className="neo-pet-bubble-title">{thread.title}</span>
              <span className="neo-pet-bubble-status">
                {state === "running" ? (
                  <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-primary" />
                ) : (
                  <CheckIcon className="size-3 shrink-0 text-primary" />
                )}
                {state === "running" ? "Working" : "Done"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${label}: bring ${NEO_PRODUCT_NAME} forward`}
        className="neo-pet-sprite"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            revealApp();
          }
        }}
      >
        <PetSprite pet={pet} mood={mood} size={petSize} rotationMs={petWorkingIntervalSec * 1000} />
      </div>
      <div className="neo-pet-controls">
        {badge.kind === "count" ? (
          <span className="neo-pet-control" aria-label={`${badge.count} running`}>
            {badge.count}
          </span>
        ) : (
          <span className="neo-pet-control" aria-label="Work finished">
            <CheckIcon className="size-3.5" />
          </span>
        )}
        <button
          type="button"
          className="neo-pet-control"
          aria-label={expanded ? "Show one run at a time" : "Show all runs"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {/* The icon swaps rather than turns: the list unfolds upward, so up means "more". */}
          {expanded ? (
            <ArrowDownNarrowWideIcon className="size-3.5" />
          ) : (
            <ArrowUpNarrowWideIcon className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
});
