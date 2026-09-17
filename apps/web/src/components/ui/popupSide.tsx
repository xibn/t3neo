import * as React from "react";

/**
 * Lets a popup tell its trigger which side it opens on, as `data-popup-side`
 * on the trigger element, without a render: the root holds one mutable record,
 * the trigger registers its element, the popup publishes its configured side.
 * Whichever mounts first, the attribute lands once both are known. The CSS
 * "Chevron animations" block in `neo/neo.css` turns the trigger's chevron by
 * it, together with Base UI's `data-popup-open`.
 */
interface PopupSideRecord {
  trigger: HTMLElement | null;
  side: string | null;
  /** True once a real side was read off an open positioner; it then outranks the configured one. */
  observed: boolean;
  observer: MutationObserver | null;
}

const PopupSideContext = React.createContext<PopupSideRecord | null>(null);

export function PopupSideProvider({ children }: { children: React.ReactNode }) {
  const record = React.useRef<PopupSideRecord>({
    trigger: null,
    side: null,
    observed: false,
    observer: null,
  }).current;
  return <PopupSideContext value={record}>{children}</PopupSideContext>;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function publishSide(record: PopupSideRecord, side: string | null): void {
  record.side = side;
  const trigger = record.trigger;
  if (!trigger) return;
  if (side) {
    trigger.dataset.popupSide = side;
  } else {
    delete trigger.dataset.popupSide;
  }
}

/** Callback ref for the trigger element that also forwards to the caller's ref. */
export function usePopupTriggerRef<T extends HTMLElement>(
  ref: React.Ref<T> | undefined,
): React.RefCallback<T> {
  const record = React.use(PopupSideContext);
  return React.useCallback(
    (node: T | null) => {
      assignRef(ref, node);
      if (!record) return;
      record.trigger = node;
      if (node && record.side) node.dataset.popupSide = record.side;
    },
    [record, ref],
  );
}

/**
 * Publish the popup's side to the registered trigger: the configured side
 * until the popup has opened once, then the side the positioner actually
 * chose (Base UI writes it as `data-side`, and flips it when the configured
 * side has no room, which is the everyday case for the composer's pickers).
 * Returns the ref to put on the positioner.
 */
export function usePublishPopupSide(side: string | undefined): React.RefCallback<HTMLElement> {
  const record = React.use(PopupSideContext);
  React.useEffect(() => {
    if (!record || record.observed) return;
    publishSide(record, side ?? null);
  }, [record, side]);
  return React.useCallback(
    (node: HTMLElement | null) => {
      if (!record) return;
      record.observer?.disconnect();
      record.observer = null;
      if (!node) return;
      const publishActual = () => {
        const actual = node.dataset.side;
        // "none" is a select aligned over its trigger: no direction to learn.
        if (!actual || actual === "none") return;
        record.observed = true;
        if (actual !== record.side) publishSide(record, actual);
      };
      publishActual();
      const observer = new MutationObserver(publishActual);
      observer.observe(node, { attributes: true, attributeFilter: ["data-side"] });
      record.observer = observer;
    },
    [record],
  );
}
