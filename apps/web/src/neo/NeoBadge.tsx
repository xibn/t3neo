import { MoonStarIcon } from "lucide-react";
import { memo, type MouseEvent } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { NEO_PRODUCT_NAME, NEO_REPOSITORY_URL } from "./neoRepository";

export function openNeoRepository(event?: MouseEvent): void {
  event?.preventDefault();
  if (isElectron && window.desktopBridge?.openExternal) {
    void window.desktopBridge.openExternal(NEO_REPOSITORY_URL);
    return;
  }
  window.open(NEO_REPOSITORY_URL, "_blank", "noopener,noreferrer");
}

/**
 * Marks a setting or control as a T3 Neo addition: a semi-transparent pill
 * reading "Neo". Amber under the Neo look, the theme's action color otherwise
 * (see --neo-mark in neo.css).
 */
export function NeoFeatureBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "neo-feature-badge inline-flex h-[1.125rem] shrink-0 items-center rounded-full px-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.04em]",
        className,
      )}
    >
      Neo
    </span>
  );
}

/** A small pill that links to the fork's repository. */
export const NeoBadge = memo(function NeoBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <a
      className={cn(
        "neo-badge inline-flex items-center gap-1.5 rounded-[0.375rem] border border-border/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground",
        className,
      )}
      href={NEO_REPOSITORY_URL}
      onClick={openNeoRepository}
      rel="noopener noreferrer"
      target="_blank"
    >
      <MoonStarIcon className="size-3 text-primary" />
      <span>{compact ? "Neo" : NEO_PRODUCT_NAME}</span>
    </a>
  );
});
