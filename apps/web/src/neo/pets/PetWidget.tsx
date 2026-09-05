import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownNarrowWideIcon,
  ArrowUpNarrowWideIcon,
  CheckIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { memo, useCallback, useRef, useState, type PointerEvent } from "react";

import { cn } from "~/lib/utils";
import { NEO_PRODUCT_NAME } from "../neoRepository";
import { useNeoSettings, useUpdateNeoSettings, type PetPosition } from "../neoSettings";
import { petBadgeFor, petMoodFor, usePetActivityStore, type PetRunningThread } from "./petActivity";
import { petDefinition } from "./petRegistry";
import { PetSprite } from "./PetSprite";
import { usePetActivitySync } from "./usePetActivitySync";

const DEFAULT_POSITION: PetPosition = { x: 16, y: 104 };
const DRAG_THRESHOLD_PX = 4;

function clampPosition(position: PetPosition, size: number): PetPosition {
  if (typeof window === "undefined") return position;
  return {
    x: Math.min(Math.max(0, position.x), Math.max(0, window.innerWidth - size)),
    y: Math.min(Math.max(0, position.y), Math.max(0, window.innerHeight - size)),
  };
}

/**
 * The floating pet: draggable, sized from settings. A bubble above it names
 * one run (the first running thread, else a finished one waiting to be seen);
 * round pills below always show the running count (0 when idle) and a fold
 * toggle that decides whether the bubble lists every run or just one. The
 * toggle is always live; its choice sticks across quiet spells, so the
 * controls never jump and the list never fills the screen on its own.
 * `mode="window"` renders it for the detached desktop pet window, where a
 * click brings the main window forward.
 */
export const PetWidget = memo(function PetWidget({ mode }: { mode: "overlay" | "window" }) {
  usePetActivitySync();
  const navigate = useNavigate();
  const { pet, petSize, petPosition, petWorkingIntervalSec } = useNeoSettings();
  const updateSettings = useUpdateNeoSettings();
  const typing = usePetActivityStore((state) => state.typing);
  const running = usePetActivityStore((state) => state.running);
  const unseenCompleted = usePetActivityStore((state) => state.unseenCompleted);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState<PetPosition | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastScreenX: number;
    lastScreenY: number;
    origin: PetPosition;
    moved: boolean;
  } | null>(null);

  const mood = petMoodFor({ typing, running });
  const badge = petBadgeFor({ running, unseenCompleted });
  const position = clampPosition(dragging ?? petPosition ?? DEFAULT_POSITION, petSize);

  /** List entries open their thread; the pet itself never navigates. */
  const openThread = useCallback(
    (thread: PetRunningThread) => {
      usePetActivityStore.getState().clearUnseen();
      if (mode === "window") {
        void window.desktopBridge?.pet?.focusMain({
          environmentId: thread.environmentId,
          threadId: thread.threadId,
        });
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: thread.environmentId, threadId: thread.threadId },
      });
    },
    [mode, navigate],
  );
  /**
   * A click on the pet only brings the app back, like a desktop pet: from the
   * detached window it reveals the main window, inside the app it does nothing.
   * Unseen work stays marked until its thread is actually opened.
   */
  const revealApp = useCallback(() => {
    if (mode === "window") void window.desktopBridge?.pet?.focusMain(null);
  }, [mode]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastScreenX: event.screenX,
        lastScreenY: event.screenY,
        origin: position,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [position],
  );
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (mode === "window") {
        // The detached window moves itself: forward screen-space deltas.
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
        return;
      }
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      setDragging(clampPosition({ x: drag.origin.x + dx, y: drag.origin.y - dy }, petSize));
    },
    [mode, petSize],
  );
  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      if (drag.moved && mode === "window") {
        setDragging(null);
        return;
      }
      if (drag.moved) {
        const final = clampPosition(
          {
            x: drag.origin.x + (event.clientX - drag.startX),
            y: drag.origin.y - (event.clientY - drag.startY),
          },
          petSize,
        );
        setDragging(null);
        updateSettings({ petPosition: final });
        return;
      }
      setDragging(null);
      revealApp();
    },
    [mode, petSize, revealApp, updateSettings],
  );

  if (pet === "none" && mode === "overlay") return null;

  const listItems: Array<{ thread: PetRunningThread; state: "running" | "done" }> = [
    ...running.map((thread) => ({ thread, state: "running" as const })),
    ...unseenCompleted.map((thread) => ({ thread, state: "done" as const })),
  ];
  const definition = petDefinition(pet);
  const shownItems = expanded ? listItems : listItems.slice(0, 1);
  // The bubble hangs off the pet toward the screen's middle so it stays on screen.
  const bubbleSide =
    mode === "overlay" && typeof window !== "undefined" && position.x > window.innerWidth / 2
      ? "end"
      : "start";

  return (
    <div
      className={cn("neo-pet-widget", mode === "window" && "neo-pet-widget-window")}
      data-neo-pet={pet}
      data-mood={mood}
      style={
        mode === "window"
          ? undefined
          : { left: `${position.x}px`, bottom: `${position.y}px`, width: `${petSize}px` }
      }
    >
      {shownItems.length > 0 ? (
        <div
          className="neo-pet-bubble"
          data-side={bubbleSide}
          role="group"
          aria-label="Agent activity"
        >
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
        aria-label={
          mode === "window"
            ? `${definition.label}: bring ${NEO_PRODUCT_NAME} forward`
            : definition.label
        }
        className="neo-pet-sprite"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(null);
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
