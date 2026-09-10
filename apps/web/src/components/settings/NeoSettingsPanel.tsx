import {
  DownloadIcon,
  ExternalLinkIcon,
  ListEndIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquarePenIcon,
} from "lucide-react";

import { isElectron } from "~/env";
import { APP_VERSION } from "~/branding";
import { NEO_DOWNLOAD_PLATFORM_LABELS, NEO_LATEST_RELEASE_URL } from "~/neo/neoRepository";
import { neoDownloadForCurrentPlatform, useLatestNeoRelease } from "~/neo/neoRelease";
import { NeoFeatureBadge } from "~/neo/NeoBadge";
import { useDesktopUpdateState } from "~/state/desktopUpdate";
import { DEFAULT_NEO_SETTINGS, useNeoSettings, useUpdateNeoSettings } from "~/neo/neoSettings";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

function openExternal(url: string): void {
  if (isElectron && window.desktopBridge?.openExternal) {
    void window.desktopBridge.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * On desktop the installed app updates itself through the release's updater
 * manifests, like any other program: check, download, restart. The web app
 * has nothing to install, so it links the download instead.
 */
function DesktopUpdateRow() {
  const state = useDesktopUpdateState();
  const bridge = window.desktopBridge;
  if (!state || !bridge) return null;
  const run = (action: () => Promise<unknown>) => {
    void action().catch((error: unknown) => {
      console.error("[NEO] desktop update action failed", error);
    });
  };
  const label =
    state.status === "checking"
      ? "Checking for updates…"
      : state.status === "available"
        ? `v${state.availableVersion ?? "?"} is available`
        : state.status === "downloading"
          ? `Downloading v${state.availableVersion ?? "?"}${
              state.downloadPercent !== null ? ` · ${Math.round(state.downloadPercent)}%` : ""
            }`
          : state.status === "downloaded"
            ? `v${state.downloadedVersion ?? "?"} is ready to install`
            : state.status === "up-to-date"
              ? `v${state.currentVersion} is the latest`
              : state.status === "error"
                ? "The last check failed"
                : state.status === "disabled"
                  ? "Updates are disabled for this build"
                  : `Installed v${state.currentVersion}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {state.status === "downloaded" ? (
        <Button size="sm" onClick={() => run(() => bridge.installUpdate())}>
          <DownloadIcon />
          Restart to update
        </Button>
      ) : state.status === "available" ? (
        <Button size="sm" onClick={() => run(() => bridge.downloadUpdate())}>
          <DownloadIcon />
          Download update
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={state.status === "checking" || state.status === "downloading"}
          onClick={() => run(() => bridge.checkForUpdate())}
        >
          Check for updates
        </Button>
      )}
    </div>
  );
}

function LatestReleaseRow() {
  const desktopUpdates = isElectron && Boolean(window.desktopBridge?.checkForUpdate);
  const state = useLatestNeoRelease();
  if (desktopUpdates) return <DesktopUpdateRow />;
  if (state.status === "loading") {
    return <span className="text-xs text-muted-foreground">Checking the latest release…</span>;
  }
  if (state.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Could not reach GitHub: {state.message}
        </span>
        <Button size="sm" variant="outline" onClick={() => openExternal(NEO_LATEST_RELEASE_URL)}>
          <ExternalLinkIcon />
          Open releases
        </Button>
      </div>
    );
  }
  const { platform, asset } = neoDownloadForCurrentPlatform(state.release);
  const isCurrent = state.release.version === APP_VERSION;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Latest: v{state.release.version}
        {isCurrent ? " (installed)" : ""}
      </span>
      {asset ? (
        <Button size="sm" onClick={() => openExternal(asset.browser_download_url)}>
          <DownloadIcon />
          Download for {NEO_DOWNLOAD_PLATFORM_LABELS[platform]}
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => openExternal(state.release.htmlUrl)}>
          <ExternalLinkIcon />
          Open release
        </Button>
      )}
    </div>
  );
}

export function NeoSettingsPanel() {
  const settings = useNeoSettings();
  const updateSettings = useUpdateNeoSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection
        id="neo"
        title="Updates"
        icon={<RefreshCwIcon className="size-4 text-primary" />}
        badge={<NeoFeatureBadge />}
      >
        <SettingsRow
          {...searchableSetting("neo-download")}
          description={
            isElectron
              ? "Check for a new version, download it, and restart to update."
              : "Download the latest version."
          }
          control={<LatestReleaseRow />}
        />
      </SettingsSection>

      <SettingsSection
        id="neo-chat"
        title="Chat"
        icon={<MessageSquareIcon className="size-4 text-primary" />}
        badge={<NeoFeatureBadge />}
      >
        <SettingsRow
          {...searchableSetting("neo-usage-badges")}
          description="Show what each turn cost under the reply: included in your plan, a share of your limit, or overage."
          resetAction={
            settings.usageBadges !== DEFAULT_NEO_SETTINGS.usageBadges ? (
              <SettingResetButton
                label="usage badges"
                onClick={() => updateSettings({ usageBadges: DEFAULT_NEO_SETTINGS.usageBadges })}
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.usageBadges}
              onCheckedChange={(checked) => updateSettings({ usageBadges: Boolean(checked) })}
              aria-label="Usage badges"
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        id="neo-queue"
        title="Message queue"
        icon={<ListEndIcon className="size-4 text-primary" />}
        badge={<NeoFeatureBadge />}
      >
        <SettingsRow
          {...searchableSetting("neo-queue-messages")}
          description="Messages sent while a turn runs wait and go out when it finishes. Off, they steer the running turn right away."
          resetAction={
            settings.queueMessages !== DEFAULT_NEO_SETTINGS.queueMessages ? (
              <SettingResetButton
                label="message queue"
                onClick={() =>
                  updateSettings({ queueMessages: DEFAULT_NEO_SETTINGS.queueMessages })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.queueMessages}
              onCheckedChange={(checked) => updateSettings({ queueMessages: Boolean(checked) })}
              aria-label="Queue messages while a turn runs"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("neo-queue-discard-confirm")}
          description="Ask before deleting a queued message."
          resetAction={
            settings.queueDiscardConfirm !== DEFAULT_NEO_SETTINGS.queueDiscardConfirm ? (
              <SettingResetButton
                label="discard confirmation"
                onClick={() =>
                  updateSettings({ queueDiscardConfirm: DEFAULT_NEO_SETTINGS.queueDiscardConfirm })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.queueDiscardConfirm}
              onCheckedChange={(checked) =>
                updateSettings({ queueDiscardConfirm: Boolean(checked) })
              }
              aria-label="Confirm before discarding a queued message"
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        id="neo-new-chats"
        title="New chat defaults"
        icon={<SparklesIcon className="size-4 text-primary" />}
        badge={<NeoFeatureBadge />}
      >
        <SettingsRow
          {...searchableSetting("neo-default-context-window")}
          description="When a new chat's model offers a context-window choice, start on the biggest or the smallest one."
          resetAction={
            settings.defaultContextWindow !== DEFAULT_NEO_SETTINGS.defaultContextWindow ? (
              <SettingResetButton
                label="context window"
                onClick={() =>
                  updateSettings({
                    defaultContextWindow: DEFAULT_NEO_SETTINGS.defaultContextWindow,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.defaultContextWindow}
              onValueChange={(value) => {
                if (value === "biggest" || value === "smallest") {
                  updateSettings({ defaultContextWindow: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Default context window">
                <SelectValue>
                  {settings.defaultContextWindow === "biggest" ? "Biggest" : "Smallest"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="smallest">
                  Smallest
                </SelectItem>
                <SelectItem hideIndicator value="biggest">
                  Biggest
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          {...searchableSetting("neo-default-fast-mode")}
          description="When a new chat's model has a fast mode, start on the fastest or the slowest setting."
          resetAction={
            settings.defaultFastMode !== DEFAULT_NEO_SETTINGS.defaultFastMode ? (
              <SettingResetButton
                label="fast mode"
                onClick={() =>
                  updateSettings({ defaultFastMode: DEFAULT_NEO_SETTINGS.defaultFastMode })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.defaultFastMode}
              onValueChange={(value) => {
                if (value === "fastest" || value === "slowest") {
                  updateSettings({ defaultFastMode: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Default fast mode">
                <SelectValue>
                  {settings.defaultFastMode === "fastest" ? "Fastest" : "Slowest"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="slowest">
                  Slowest
                </SelectItem>
                <SelectItem hideIndicator value="fastest">
                  Fastest
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection
        id="neo-composer"
        title="Composer"
        icon={<SquarePenIcon className="size-4 text-primary" />}
        badge={<NeoFeatureBadge />}
      >
        <SettingsRow
          {...searchableSetting("neo-header-actions-toggle")}
          description="Add a button to the chat header that folds its actions away and back."
          resetAction={
            settings.headerActionsToggle !== DEFAULT_NEO_SETTINGS.headerActionsToggle ? (
              <SettingResetButton
                label="header actions button"
                onClick={() =>
                  updateSettings({ headerActionsToggle: DEFAULT_NEO_SETTINGS.headerActionsToggle })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.headerActionsToggle}
              onCheckedChange={(checked) =>
                updateSettings({ headerActionsToggle: Boolean(checked) })
              }
              aria-label="Show the header actions button"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("neo-header-actions-collapsed")}
          description="Fold the chat header's actions away, the same as the button in the header."
          resetAction={
            settings.headerActionsCollapsed !== DEFAULT_NEO_SETTINGS.headerActionsCollapsed ? (
              <SettingResetButton
                label="header actions"
                onClick={() =>
                  updateSettings({
                    headerActionsCollapsed: DEFAULT_NEO_SETTINGS.headerActionsCollapsed,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.headerActionsCollapsed}
              onCheckedChange={(checked) =>
                updateSettings({ headerActionsCollapsed: Boolean(checked) })
              }
              aria-label="Collapse header actions"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("neo-composer-expanded")}
          description="The message box grows with your text up to eight lines and keeps that height until you send. Empty, it stays small."
          resetAction={
            settings.composerExpanded !== DEFAULT_NEO_SETTINGS.composerExpanded ? (
              <SettingResetButton
                label="composer size"
                onClick={() =>
                  updateSettings({ composerExpanded: DEFAULT_NEO_SETTINGS.composerExpanded })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerExpanded}
              onCheckedChange={(checked) => updateSettings({ composerExpanded: Boolean(checked) })}
              aria-label="Keep the composer expanded"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("neo-branch-toolbar")}
          description="Where the workspace and branch controls live: below the message box by default, or in the top bar next to Open to give the composer more room."
          resetAction={
            settings.branchToolbarPosition !== DEFAULT_NEO_SETTINGS.branchToolbarPosition ? (
              <SettingResetButton
                label="branch manager position"
                onClick={() =>
                  updateSettings({
                    branchToolbarPosition: DEFAULT_NEO_SETTINGS.branchToolbarPosition,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.branchToolbarPosition}
              onValueChange={(value) => {
                if (value === "composer" || value === "header") {
                  updateSettings({ branchToolbarPosition: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Branch manager position">
                <SelectValue>
                  {settings.branchToolbarPosition === "header" ? "Top bar" : "Default"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="composer">
                  Default
                </SelectItem>
                <SelectItem hideIndicator value="header">
                  Top bar
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          {...searchableSetting("neo-branch-toolbar-move")}
          description="Show the pill that moves the branch manager between the composer and the top bar."
          resetAction={
            settings.branchToolbarMoveButton !== DEFAULT_NEO_SETTINGS.branchToolbarMoveButton ? (
              <SettingResetButton
                label="move pill"
                onClick={() =>
                  updateSettings({
                    branchToolbarMoveButton: DEFAULT_NEO_SETTINGS.branchToolbarMoveButton,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.branchToolbarMoveButton}
              onCheckedChange={(checked) =>
                updateSettings({ branchToolbarMoveButton: Boolean(checked) })
              }
              aria-label="Show the branch manager move pill"
            />
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
