import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MessageId } from "@t3tools/contracts";
import {
  ChevronDownIcon,
  CornerDownRightIcon,
  GripVerticalIcon,
  ListEndIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { memo, useState } from "react";

import type { QueuedThreadMessage } from "~/messageQueueStore";
import { useNeoSettings } from "~/neo/neoSettings";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ComposerBanner } from "./ComposerBanner";

const PREVIEW_MAX_CHARS = 140;

// The expanded queue can grow without bound; past this many rows it stops
// growing and the rest collapse into a single "+N more" summary line.
const MAX_VISIBLE_QUEUE_ROWS = 5;

/** One line of the queued text, whitespace collapsed, for the queue row. */
export function queuedMessagePreview(message: Pick<QueuedThreadMessage, "text" | "attachments">) {
  const line = message.text
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  const text = (line ?? "").replace(/\s+/g, " ");
  const preview =
    text.length > PREVIEW_MAX_CHARS ? `${text.slice(0, PREVIEW_MAX_CHARS - 1)}…` : text;
  if (preview.length > 0) return preview;
  const count = message.attachments.length;
  return count === 1 ? "1 attachment" : `${count} attachments`;
}

export function queuedMessagesSummary(count: number, threadBusy: boolean, paused = false): string {
  const noun = count === 1 ? "message" : "messages";
  if (paused) {
    return `${count} queued ${noun} paused · resume or send a message to continue`;
  }
  return threadBusy
    ? `${count} queued ${noun} will send when the current turn finishes`
    : `${count} queued ${noun} sending`;
}

/**
 * The delete control for one queued message. With the Neo "confirm before
 * discarding" setting on (default), it opens a small confirm popover that
 * dismisses on click-away or Escape; off, it deletes on the first click.
 */
function DiscardQueuedMessageButton({
  confirm,
  onDiscard,
}: {
  confirm: boolean;
  onDiscard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = (
    <Button
      size="icon-xs"
      variant="ghost-muted"
      aria-label="Delete queued message"
      onClick={confirm ? undefined : onDiscard}
    >
      <Trash2Icon />
    </Button>
  );
  if (!confirm) return trigger;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverPopup side="top" align="end" className="w-60 [--popup-width:15rem]">
        <div className="grid gap-2.5">
          <p className="text-[13px] font-medium text-foreground">Discard this queued message?</p>
          <div className="flex justify-end gap-2">
            <Button size="compact" variant="ghost-muted" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="compact"
              variant="destructive"
              onClick={() => {
                onDiscard();
                setOpen(false);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/**
 * One queued message: a drag handle in the icon column, the preview, and its
 * actions. The sortable wrapper carries the transform so the banner row keeps
 * its own grid.
 */
const QueuedMessageRow = memo(function QueuedMessageRow({
  message,
  sortable,
  confirmDiscard,
  onSendNow,
  onEdit,
  onDiscard,
}: {
  message: QueuedThreadMessage;
  sortable: boolean;
  confirmDiscard: boolean;
  onSendNow: (messageId: MessageId) => void;
  onEdit: (messageId: MessageId) => void;
  onDiscard: (messageId: MessageId) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: message.id, disabled: !sortable });
  const sending = message.sendNow === true;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10")}
    >
      <ComposerBanner.Row layout="wrap-actions" data-chat-composer-queued-message={message.id}>
        <ComposerBanner.Icon aria-hidden={false}>
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label="Drag to reorder"
            disabled={!sortable}
            className={cn(
              "flex size-5 touch-none items-center justify-center rounded-sm text-muted-foreground/70 outline-none focus-visible:outline-2 focus-visible:outline-ring [&>svg]:size-3",
              sortable
                ? "cursor-grab hover:text-foreground active:cursor-grabbing"
                : "cursor-default opacity-50",
            )}
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon />
          </button>
        </ComposerBanner.Icon>
        <ComposerBanner.Content>
          <span className="min-w-0 flex-1 truncate text-foreground/85">
            {queuedMessagePreview(message)}
          </span>
          {message.attachments.length > 0 && message.text.trim().length > 0 ? (
            <span className="shrink-0 text-muted-foreground">+{message.attachments.length}</span>
          ) : null}
          {message.error ? (
            <span className="min-w-0 shrink truncate text-destructive">{message.error}</span>
          ) : null}
        </ComposerBanner.Content>
        <ComposerBanner.Actions>
          <Button
            size="compact"
            variant="ghost-muted"
            disabled={sending}
            onClick={() => onSendNow(message.id)}
          >
            <CornerDownRightIcon />
            {sending ? "Sending…" : message.error ? "Retry" : "Send now"}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Edit queued message"
            disabled={sending}
            onClick={() => onEdit(message.id)}
          >
            <PencilIcon />
          </Button>
          <DiscardQueuedMessageButton
            confirm={confirmDiscard}
            onDiscard={() => onDiscard(message.id)}
          />
        </ComposerBanner.Actions>
      </ComposerBanner.Row>
    </div>
  );
});

export const ComposerQueuedMessages = memo(function ComposerQueuedMessages({
  messages,
  threadBusy,
  paused,
  onSendNow,
  onSendAllNow,
  onEdit,
  onDiscard,
  onReorder,
  onResume,
}: {
  messages: ReadonlyArray<QueuedThreadMessage>;
  threadBusy: boolean;
  /** Stop parked the queue; it waits for Resume, a direct send, or Send now. */
  paused: boolean;
  onSendNow: (messageId: MessageId) => void;
  onSendAllNow: () => void;
  /** Takes the message out of the queue and back into the composer. */
  onEdit: (messageId: MessageId) => void;
  onDiscard: (messageId: MessageId) => void;
  /** The thread's whole queue in its new order, after a drop. */
  onReorder: (orderedIds: ReadonlyArray<MessageId>) => void;
  onResume: () => void;
}) {
  // Collapsed, the queue is one badge-high row: the count and a chevron.
  const [collapsed, setCollapsed] = useState(false);
  const confirmDiscard = useNeoSettings().queueDiscardConfirm;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (messages.length === 0) return null;
  const allForced = messages.every((message) => message.sendNow === true);
  const ids = messages.map((message) => message.id);
  const sortable = messages.length > 1;
  const onDragEnd = (event: DragEndEvent) => {
    const over = event.over;
    if (over === null || over.id === event.active.id) return;
    const from = ids.indexOf(event.active.id as MessageId);
    const to = ids.indexOf(over.id as MessageId);
    if (from === -1 || to === -1) return;
    onReorder(arrayMove([...ids], from, to));
  };
  const toggle = (
    <Button
      size="icon-xs"
      variant="ghost-muted"
      aria-label={collapsed ? "Expand queued messages" : "Collapse queued messages"}
      aria-expanded={!collapsed}
      onClick={() => setCollapsed((value) => !value)}
    >
      <ChevronDownIcon className={cn("transition-transform", collapsed && "-rotate-90")} />
    </Button>
  );
  return (
    <ComposerBanner.Root
      data-chat-composer-queue="true"
      data-collapsed={collapsed}
      data-paused={paused || undefined}
    >
      <ComposerBanner.Row layout="wrap-actions">
        <ComposerBanner.Icon>{paused ? <PauseIcon /> : <ListEndIcon />}</ComposerBanner.Icon>
        <ComposerBanner.Content>
          <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
            {collapsed
              ? `${messages.length} queued${paused ? " · paused" : ""}`
              : queuedMessagesSummary(messages.length, threadBusy, paused)}
          </span>
        </ComposerBanner.Content>
        <ComposerBanner.Actions>
          {paused ? (
            <Button size="compact" variant="ghost-muted" onClick={onResume}>
              <PlayIcon />
              Resume
            </Button>
          ) : null}
          {!collapsed && messages.length > 1 && !allForced ? (
            <Button size="compact" variant="ghost-muted" onClick={onSendAllNow}>
              Send all now
            </Button>
          ) : null}
          {toggle}
        </ComposerBanner.Actions>
      </ComposerBanner.Row>
      {collapsed ? null : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ComposerBanner.Children>
              {messages.slice(0, MAX_VISIBLE_QUEUE_ROWS).map((message) => (
                <QueuedMessageRow
                  key={message.id}
                  message={message}
                  sortable={sortable}
                  confirmDiscard={confirmDiscard}
                  onSendNow={onSendNow}
                  onEdit={onEdit}
                  onDiscard={onDiscard}
                />
              ))}
              {messages.length > MAX_VISIBLE_QUEUE_ROWS ? (
                <ComposerBanner.Row layout="wrap-actions" data-chat-composer-queue-overflow="true">
                  <ComposerBanner.Icon />
                  <ComposerBanner.Content>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      … +{messages.length - MAX_VISIBLE_QUEUE_ROWS} more queued
                    </span>
                  </ComposerBanner.Content>
                </ComposerBanner.Row>
              ) : null}
            </ComposerBanner.Children>
          </SortableContext>
        </DndContext>
      )}
    </ComposerBanner.Root>
  );
});
