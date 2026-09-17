import { GithubIcon, MoonStarIcon } from "lucide-react";
import { memo } from "react";

import { APP_VERSION } from "~/branding";
import { Button } from "../components/ui/button";
import { openNeoRepository } from "./NeoBadge";
import { NEO_PRODUCT_NAME } from "./neoRepository";

/** The strip above every settings tab: the fork's name and version, and its repository. */
export const NeoVersionCard = memo(function NeoVersionCard() {
  return (
    <div
      className="neo-version-card flex w-full items-center justify-between gap-3 rounded-[0.75rem] border border-primary/30 bg-primary/6 py-1.5 pr-1.5 pl-4"
      data-neo-version-card=""
    >
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <MoonStarIcon className="neo-ember-glow size-4 shrink-0 text-primary" />
        <span className="truncate">
          {NEO_PRODUCT_NAME} v{APP_VERSION}
        </span>
      </div>
      <Button size="xs" variant="outline" onClick={openNeoRepository}>
        <GithubIcon />
        Open Repository
      </Button>
    </div>
  );
});
