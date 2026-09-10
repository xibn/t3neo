import {
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  MoonStarIcon,
  PawPrintIcon,
  GitPullRequestIcon,
  SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import { Link, useCanGoBack, useLocation, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { useNeoSettings } from "../../neo/neoSettings";
import { useEnvironments } from "../../state/environments";
import { T3Wordmark } from "../T3Wordmark";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  resolveSidebarStageFocusRingOffsetClass,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { APP_BASE_NAME } from "../../branding";
import { useAppearanceLook } from "../../appearanceLook";
import { NeoStarfield } from "../../neo/NeoStarfield";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";

import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";

/** "T3 Neo" renders as the T3 wordmark plus this suffix. */
const APP_BRAND_SUFFIX = APP_BASE_NAME.replace(/^T3\s*/i, "") || "Neo";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  // The starfield stands in for the stage artwork; with it off (Settings →
  // Appearance) the header goes back to upstream's brand and artwork.
  const appearanceLook = useAppearanceLook();
  const neoLook = appearanceLook === "neo";
  // The Neo look owns the header with its starfield; stage artwork stays for the standard look.
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork" && !neoLook,
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <SidebarHeader
      className={cn(
        "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        isElectron && "drag-region",
      )}
    >
      {neoLook ? (
        <div aria-hidden className="neo-sidebar-backdrop">
          <NeoStarfield />
        </div>
      ) : backdropVariant ? (
        <SidebarStageBackdrop variant={backdropVariant} />
      ) : null}
      <SidebarTrigger
        className={cn(
          "relative z-10 md:hidden",
          backdropVariant &&
            "focus-visible:ring-white/90 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white! [:hover,[data-pressed]]:bg-white/15",
          backdropVariant && resolveSidebarStageFocusRingOffsetClass(backdropVariant),
        )}
      />
      <SidebarBrand pinnedEnd={neoLook} onBackdrop={backdropVariant !== null} />
      {pillLabel ? (
        <Badge
          className="relative z-10 ml-1 hidden rounded-full px-1.5 text-muted-foreground @[15rem]/sidebar-header:inline-flex"
          data-environment-identification="pill"
          size="sm"
          variant="secondary"
        >
          {pillLabel}
        </Badge>
      ) : null}
    </SidebarHeader>
  );
});

function SidebarBrand({ pinnedEnd, onBackdrop }: { pinnedEnd: boolean; onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "z-10 hidden h-7 w-fit min-w-0 shrink-0 items-center gap-1.5 rounded-md pl-1 outline-hidden ring-ring focus-visible:ring-2 md:flex",
        // The Neo look pins the brand to the right edge of its starfield, clear of the
        // sidebar toggle on the left; the standard look keeps it left. Pinned, the
        // brand stays open so its ring glow can reach past the wordmark's box.
        pinnedEnd
          ? "absolute right-3 top-1/2 -translate-y-1/2 overflow-visible"
          : "relative ml-[calc(var(--workspace-titlebar-content-left)+0.5rem)] overflow-hidden",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      {pinnedEnd ? <span aria-hidden className="neo-brand-glow" /> : null}
      <MoonStarIcon className="neo-ember-glow size-3.5 shrink-0 text-primary" />
      <span className="inline-flex min-w-0 items-baseline gap-1">
        <T3Wordmark aria-label="T3" className="h-2.5 w-auto shrink-0" />
        <span
          className={cn(
            "truncate text-sm font-medium tracking-tight",
            onBackdrop ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {APP_BRAND_SUFFIX}
        </span>
      </span>
    </Link>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { isMobile, setOpenMobile } = useSidebar();
  const currentFooterPage = useLocation({
    select: (location) =>
      /^\/settings(?:\/|$)/.test(location.pathname)
        ? "settings"
        : /^\/projects\/[^/]+\/?$/.test(location.pathname)
          ? "project-settings"
          : location.pathname === "/usage"
            ? "usage"
            : location.pathname === "/pull-requests"
              ? "pull-requests"
              : null,
  });
  const { environments } = useEnvironments();
  // The page reads every connected server, so one of them offering pull requests is enough for
  // the link to lead somewhere.
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const handlePullRequestsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
  }, [closeMobileSidebar, navigate]);
  const handleSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  }, [closeMobileSidebar, navigate]);

  const handleUsageClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);
  const handlePetSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings/pets" });
  }, [closeMobileSidebar, navigate]);

  const handleBackClick = useCallback(() => {
    closeMobileSidebar();
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, closeMobileSidebar, navigate]);

  return (
    <SidebarMenu className="flex-row items-center">
      {currentFooterPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <>
          <SidebarUtilityItem
            icon={<SettingsIcon />}
            label="Settings"
            onClick={handleSettingsClick}
          />
          {pullRequestsSupported ? (
            <SidebarUtilityItem
              icon={<GitPullRequestIcon />}
              label="Pull Requests"
              onClick={handlePullRequestsClick}
            />
          ) : null}
          <SidebarUtilityItem
            icon={<ChartNoAxesColumnIcon />}
            label="Usage"
            onClick={handleUsageClick}
          />
          <SidebarPetButton onClick={handlePetSettingsClick} />
        </>
      )}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter className="p-[var(--sidebar-content-inset)]">
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});

/** Paw-print shortcut in the sidebar footer straight to Settings → Pets; filled while a pet is on. */
const SidebarPetButton = memo(function SidebarPetButton({ onClick }: { onClick: () => void }) {
  const { pet } = useNeoSettings();
  return (
    <SidebarUtilityItem
      icon={<PawPrintIcon className={pet !== "none" ? "fill-current text-primary" : undefined} />}
      label="Pet"
      onClick={onClick}
    />
  );
});
