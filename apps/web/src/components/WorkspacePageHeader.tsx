import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/utils";
import { NeoStarSky } from "../neo/NeoStarfield";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";

/**
 * Shared workspace top-bar geometry. Under the Neo look every page is folded:
 * the bar is a strip, the content a card, and whatever the page marks as
 * `data-workspace-page-actions` sits in a notch at the card's top-right. Only
 * the chat decides for itself, from the header-actions setting, and passes
 * its own `data-neo-header-collapsed`.
 */
export function WorkspacePageHeader({
  electron = false,
  reserveNativeControls = electron,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"header"> & {
  readonly electron?: boolean;
  readonly reserveNativeControls?: boolean;
}) {
  return (
    <header
      data-neo-page-header=""
      data-neo-header-collapsed=""
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 pl-[calc(env(safe-area-inset-left)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:pl-[calc(env(safe-area-inset-left)+1.25rem)] sm:pr-[calc(env(safe-area-inset-right)+1.25rem)]",
        electron && "drag-region",
        reserveNativeControls && "wco:pr-[var(--workspace-native-controls-inset)]",
        COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        className,
      )}
      {...props}
    >
      {/* The Neo look's star trail; it draws nothing under the other looks. */}
      <NeoStarSky variant="topbar" />
      {children}
    </header>
  );
}
