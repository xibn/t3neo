import {
  ArrowDownNarrowWideIcon,
  ArrowUpNarrowWideIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleHelpIcon,
  LoaderCircleIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import { NEO_PRODUCT_NAME } from "../neoRepository";
import { useNeoSettings } from "../neoSettings";
import { isImportedPetId, useImportedPet } from "./importedPets";
import {
  petBadgeFor,
  petMoodFor,
  usePetActivityStore,
  type PetActivitySnapshot,
  type PetThread,
} from "./petActivity";
import { petDefinition, type PetMood } from "./petRegistry";
import { PetSprite } from "./PetSprite";
import type { SpriteDragDirection } from "./SpritePet";
import { usePetActivitySync } from "./usePetActivitySync";

const DRAG_THRESHOLD_PX = 4;
/** Air around the pet inside its window, matching `.neo-pet-widget-window` padding. */
const PET_WINDOW_PADDING_PX = 8;

type ListState = "waiting" | "running" | "failed" | "done";

/** Codex's own words for the four states, as its pet shows them. */
const LIST_LABELS: Record<ListState, string> = {
  waiting: "Needs input",
  running: "Running",
  failed: "Blocked",
  done: "Ready",
};

/** The threads behind the mood; a change here replays a sprite pet's state like a new notification. */
function stateKeyFor(mood: PetMood, snapshot: PetActivitySnapshot): string {
  const threads =
    mood === "waiting"
      ? snapshot.waiting
      : mood === "working"
        ? snapshot.running
        : mood === "failed"
          ? snapshot.unseenFailed
          : mood === "done"
            ? snapshot.unseenCompleted
            : [];
  return threads.map((thread) => thread.key).join("\n");
}

/**
 * The pet in its own desktop window, sized from settings. A bubble above it
 * names one thread (one that needs input first, else a running one, else a
 * failed or finished one nobody looked at); round pills below always show the running count (0 when idle) and a
 * fold toggle that decides whether the bubble lists every run or just one.
 * The toggle is always live; its choice sticks across quiet spells, so the
 * controls never jump and the list never fills the screen on its own.
 * Dragging the pet moves the window (a Codex pet runs along); a click brings
 * the main window forward (a Codex pet waves).
 */
export const PetWidget = memo(function PetWidget() {
  usePetActivitySync();
  const { pet, petSize } = useNeoSettings();
  const typing = usePetActivityStore((state) => state.typing);
  const running = usePetActivityStore((state) => state.running);
  const waiting = usePetActivityStore((state) => state.waiting);
  const unseenCompleted = usePetActivityStore((state) => state.unseenCompleted);
  const unseenFailed = usePetActivityStore((state) => state.unseenFailed);
  const importedPet = useImportedPet(pet);
  const [expanded, setExpanded] = useState(false);
  const [dragDirection, setDragDirection] = useState<SpriteDragDirection | null>(null);
  const [waveToken, setWaveToken] = useState(0);
  const stackRef = useRef<HTMLDivElement | null>(null);

  // The window follows the content: bubble, pet and pills, plus the padding.
  useEffect(() => {
    const stack = stackRef.current;
    const resize = window.desktopBridge?.pet?.resizeWindow;
    if (!stack || !resize || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      const width = box ? box.inlineSize : stack.offsetWidth;
      const height = box ? box.blockSize : stack.offsetHeight;
      void resize({
        width: width + PET_WINDOW_PADDING_PX * 2,
        height: height + PET_WINDOW_PADDING_PX * 2,
      });
    });
    observer.observe(stack);
    return () => observer.disconnect();
  }, [pet]);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastScreenX: number;
    lastScreenY: number;
    moved: boolean;
  } | null>(null);

  const snapshot: PetActivitySnapshot = { typing, running, waiting, unseenCompleted, unseenFailed };
  const mood = petMoodFor(snapshot);
  // Codex pets do not watch the composer, so theirs is the mood without typing.
  const spriteMood = petMoodFor({ ...snapshot, typing: false });
  const stateKey = stateKeyFor(spriteMood, snapshot);
  const badge = petBadgeFor(snapshot);

  /** List entries open their thread in the main window; the pet itself never navigates. */
  const openThread = useCallback((thread: PetThread) => {
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
    // The pet runs the way it is pulled; a vertical pull keeps the last direction.
    if (dx !== 0) setDragDirection(dx > 0 ? "right" : "left");
    else setDragDirection((current) => current ?? "right");
  }, []);
  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragDirection(null);
      if (!drag.moved) {
        setWaveToken((token) => token + 1);
        revealApp();
      }
    },
    [revealApp],
  );

  if (pet === "none") return null;

  const listItems: Array<{ thread: PetThread; state: ListState }> = [
    ...waiting.map((thread) => ({ thread, state: "waiting" as const })),
    ...running
      .filter((thread) => !waiting.some((entry) => entry.key === thread.key))
      .map((thread) => ({ thread, state: "running" as const })),
    ...unseenFailed.map((thread) => ({ thread, state: "failed" as const })),
    ...unseenCompleted.map((thread) => ({ thread, state: "done" as const })),
  ];
  const label = importedPet?.name ?? petDefinition(pet).label;
  const shownItems = expanded ? listItems : listItems.slice(0, 1);

  return (
    <div
      className="neo-pet-widget neo-pet-widget-window"
      data-neo-pet={pet}
      data-mood={mood}
      style={{ "--neo-pet-width": `${petSize}px` } as CSSProperties}
    >
      <div ref={stackRef} className="neo-pet-stack">
        {shownItems.length > 0 ? (
          <div
            className="neo-pet-bubble"
            data-side="start"
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
                  ) : state === "waiting" ? (
                    <CircleHelpIcon className="size-3 shrink-0 text-primary" />
                  ) : state === "failed" ? (
                    <CircleAlertIcon className="size-3 shrink-0 text-destructive" />
                  ) : (
                    <CheckIcon className="size-3 shrink-0 text-primary" />
                  )}
                  {LIST_LABELS[state]}
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
            setDragDirection(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              revealApp();
            }
          }}
        >
          <PetSprite
            pet={pet}
            mood={isImportedPetId(pet) ? spriteMood : mood}
            stateKey={stateKey}
            size={petSize}
            gesture={{ dragDirection, waveToken }}
          />
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
    </div>
  );
});
