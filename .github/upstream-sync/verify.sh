#!/usr/bin/env bash
# Proves the T3 Neo feature set is present and working on the current tree.
# Used by agent.sh inside the Claude Code loop and by the workflow before it
# builds. Focused on the fork's features: the workflow's quality job runs the
# full suite.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

# The workspace-local binary keeps a single vitest instance in play; a global
# `vp` running the workspace's `vite-plus/test` can load two copies and fail
# with "Vitest failed to find the current suite".
if [[ -x "$root/node_modules/.bin/vp" ]]; then
  vp() { "$root/node_modules/.bin/vp" "$@"; }
fi

fail() {
  echo "verify: $*" >&2
  exit 1
}

require_files() {
  for file in "$@"; do
    [[ -f "$file" ]] || fail "missing $file"
  done
}

require_grep() {
  local pattern="$1" file="$2" message="$3"
  grep -q -- "$pattern" "$file" || fail "$message"
}

# --- Feature 1: queued messages -------------------------------------------
require_files \
  apps/web/src/messageQueueStore.ts \
  apps/web/src/messageQueueStore.test.ts \
  apps/web/src/hooks/useMessageQueueDrain.ts \
  apps/web/src/components/chat/ComposerQueuedMessages.tsx
require_grep "useMessageQueueDrain" apps/web/src/routes/__root.tsx \
  "useMessageQueueDrain is not mounted in routes/__root.tsx"
require_grep "shouldQueueComposerSubmission" apps/web/src/components/ChatView.tsx \
  "ChatView.onSend does not consult shouldQueueComposerSubmission"
require_grep "MAX_VISIBLE_QUEUE_ROWS" apps/web/src/components/chat/ComposerQueuedMessages.tsx \
  "the queue does not cap its visible rows"
require_grep "queueDiscardConfirm" apps/web/src/neo/neoSettings.ts \
  "neoSettings lacks the queue discard confirmation preference"
require_grep "DiscardQueuedMessageButton" apps/web/src/components/chat/ComposerQueuedMessages.tsx \
  "the queue delete button has no confirm pop-over"
require_grep ":not(\[data-neo-composer-expanded\])" apps/web/src/looks/neo.css \
  "the Neo look does not compact the empty composer"
require_grep "svg.lucide-chevron-down" apps/web/src/looks/neo.css \
  "the composer footer chevrons have no divider"
require_grep "button:has(svg.lucide-chevron-down)" apps/web/src/looks/neo.css \
  "the composer footer chevron divider is not drawn on the button"
require_grep "data-popup-side\]\[data-popup-open\]" apps/web/src/neo/neo.css \
  "chevrons do not rotate only while their popup is open"
require_grep "data-neo-page-header" apps/web/src/components/WorkspacePageHeader.tsx \
  "the shared page header does not fold under the Neo look"
require_grep "data-workspace-page-actions" apps/web/src/routes/settings.tsx \
  "the settings page has no notch host for Restore defaults"
require_grep "data-neo-header-collapsed" apps/web/src/looks/neo.css \
  "the collapsed top bar has no Neo card outline"
require_grep '"immediate"' apps/web/src/composer-logic.ts \
  "ComposerSubmissionIntent lacks the immediate intent"
require_grep "Queue message" apps/web/src/components/chat/ComposerPrimaryActions.tsx \
  "ComposerPrimaryActions has no Queue button"
require_grep "Queued messages" docs/user/composer.md \
  "docs/user/composer.md lacks the Queued messages section"

# --- Feature 2: the Neo look -------------------------------------------------
require_files \
  apps/web/src/appearanceLook.ts \
  apps/web/src/appearanceLook.test.ts \
  apps/web/src/looks/neo.css \
  docs/user/appearance-looks.md
require_grep 'looks/neo.css' apps/web/src/main.tsx "main.tsx does not import looks/neo.css"
require_grep 't3code:appearance-look' apps/web/index.html \
  "index.html does not apply the stored look before first paint"
require_grep 'DEFAULT_APPEARANCE_LOOK: AppearanceLook = "neo"' apps/web/src/appearanceLook.ts \
  "the Neo look is not the default look"
require_grep 'appearance-look' apps/web/src/components/settings/SettingsPanels.tsx \
  "Appearance settings lack the Look row"
require_grep 'html\[data-look="neo"\]' apps/web/src/looks/neo.css \
  "neo.css is not scoped under html[data-look=neo]"
require_files \
  apps/web/src/appearanceFonts.ts \
  apps/web/src/appearanceFonts.test.ts \
  apps/web/src/chevronAnimations.ts \
  apps/web/src/chevronAnimations.test.ts \
  apps/web/src/components/ui/popupSide.tsx
require_grep 'NEO_SANS_FAMILY' apps/web/src/appearanceFonts.ts \
  "appearanceFonts.ts does not pin Schibsted Grotesk as the Neo font"
require_grep '@fontsource/schibsted-grotesk' apps/web/src/main.tsx \
  "main.tsx does not bundle Schibsted Grotesk"
require_grep 'appearance-chevron-animations' apps/web/src/components/settings/SettingsPanels.tsx \
  "Appearance settings lack the Chevron animations switch"
require_grep 't3code:chevron-animations' apps/web/index.html \
  "index.html does not apply the stored chevron setting before first paint"
require_grep 'usePublishPopupSide' apps/web/src/components/ui/menu.tsx \
  "the Menu popup does not publish its side to the trigger"
require_grep 'appearance-agent-controls' apps/web/src/components/settings/SettingsPanels.tsx \
  "Appearance settings lack the Agent controls select"
require_grep 'data-neo-agent-controls' apps/web/src/components/chat/ChatComposer.tsx \
  "the composer footer does not carry the agent controls style"
require_grep 'data-neo-agent-controls="topbar"' apps/web/src/neo/neo.css \
  "neo.css has no top bar style for the composer controls"

# --- Feature 3: T3 Neo branding, repository links, downloads ----------------
require_files \
  apps/web/src/neo/neoRepository.ts \
  apps/web/src/neo/neoRelease.ts \
  apps/web/src/neo/NeoBadge.tsx \
  apps/web/src/neo/NeoStarfield.tsx \
  apps/web/src/neo/neo.css \
  assets/neo/download-button.svg \
  assets/neo/app-icon.svg \
  assets/neo/screenshots/header-collapsed.jpg \
  assets/neo/screenshots/chat.jpg \
  assets/neo/screenshots/chat-focus.jpg \
  assets/neo/screenshots/processes.jpg \
  assets/neo/screenshots/settings-pets.jpg \
  assets/neo/screenshots/settings-neo.jpg \
  assets/neo/screenshots/settings-appearance.jpg \
  assets/neo/screenshots/usage.jpg \
  docs/_config.yml \
  docs/favicon.svg \
  docs/download/index.html \
  scripts/neo/generate-neo-icons.ts
require_grep '"T3 Neo"' apps/web/src/branding.ts "web branding fallback is not T3 Neo"
require_grep 'APP_BASE_NAME = "T3 Neo"' apps/desktop/src/app/DesktopEnvironment.ts \
  "desktop APP_BASE_NAME is not T3 Neo"
require_grep '"productName": "T3 Neo' apps/desktop/package.json \
  "desktop productName is not T3 Neo"
require_grep 'T3-Neo-' scripts/build-desktop-artifact.ts \
  "desktop artifacts are not named T3-Neo-*"
require_grep 'DESKTOP_APP_ID = "com.xibn.t3neo"' scripts/build-desktop-artifact.ts \
  "desktop bundle id is not com.xibn.t3neo"
require_grep '"com.xibn.t3neo"' apps/desktop/src/app/DesktopEnvironment.ts \
  "desktop app user model id is not com.xibn.t3neo"
require_grep 'nightly\\.(?:neo\\.)?' scripts/build-desktop-artifact.ts \
  "desktop packaging does not treat X.Y.Z-nightly.neo.* as the nightly channel"
require_grep 'nightly\\.(?:neo\\.)?' apps/desktop/src/updates/updateChannels.ts \
  "the desktop updater does not treat X.Y.Z-nightly.neo.* as the nightly channel"
require_grep 'NEO_REPOSITORY_URL' apps/web/src/components/desktopUpdate.logic.ts \
  "desktop update release links do not point at the fork repository"
require_grep 'NeoStarfield' apps/web/src/components/sidebar/SidebarChrome.tsx \
  "the sidebar header has no starfield"
require_grep 'extraActions' apps/web/src/components/chat/ChatHeader.tsx \
  "the chat header has no slot for the branch manager"
require_grep 'branchToolbarPosition' apps/web/src/components/ChatView.tsx \
  "ChatView does not dock the branch manager by the Neo setting"
require_grep 'NeoStarfield' apps/web/src/components/sidebar/SidebarChrome.tsx \
  "the sidebar header has no starfield"
require_grep 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' assets/prod/logo.svg \
  "assets/prod/logo.svg is not the moon-star icon"

# --- Feature 4: Neo settings, pets, usage badges ----------------------------
require_files \
  apps/web/src/neo/neoSettings.ts \
  apps/web/src/neo/neoSettings.test.ts \
  apps/web/src/neo/turnUsage.ts \
  apps/web/src/neo/turnUsage.test.ts \
  apps/web/src/neo/UsageBadge.tsx \
  apps/web/src/neo/ComposerUsageBadge.tsx \
  apps/web/src/neo/usagePlan.ts \
  apps/web/src/neo/NeoVersionCard.tsx \
  apps/web/src/neo/pets/petRegistry.ts \
  apps/web/src/neo/pets/petActivity.ts \
  apps/web/src/neo/pets/petActivity.test.ts \
  apps/web/src/neo/pets/usePetActivitySync.ts \
  apps/web/src/neo/pets/PetWidget.tsx \
  apps/web/src/neo/pets/usePetWindowSync.ts \
  apps/web/src/neo/pets/PetPreview.tsx \
  apps/web/src/neo/pets/RabbitPet.tsx \
  apps/web/src/neo/pets/WukongPet.tsx \
  apps/web/src/neo/pets/AsciiAnimation.tsx \
  apps/web/src/neo/pets/spriteSheet.ts \
  apps/web/src/neo/pets/spriteSheet.test.ts \
  apps/web/src/neo/pets/SpritePet.tsx \
  apps/web/src/neo/pets/petGalleries.ts \
  apps/web/src/neo/pets/petGalleries.test.ts \
  apps/web/src/neo/pets/galleryFetch.ts \
  apps/web/src/neo/pets/importedPets.ts \
  apps/web/src/neo/pets/importedPets.test.ts \
  apps/web/src/neo/pets/PetGalleryBrowser.tsx \
  apps/desktop/src/ipc/methods/pet.test.ts \
  apps/web/src/neo/pets/ImportedPetCard.tsx \
  apps/web/src/neo/openExternal.ts \
  apps/web/src/components/settings/NeoSettingsPanel.tsx \
  apps/web/src/routes/settings.neo.tsx \
  apps/web/src/routes/pet.tsx \
  apps/desktop/src/ipc/methods/pet.ts \
  apps/server/src/orchestration/turnUsage.ts \
  apps/server/src/orchestration/turnUsage.test.ts \
  apps/server/src/diagnostics/ListenerProcesses.ts \
  apps/server/src/diagnostics/ListenerProcesses.test.ts \
  docs/user/neo.md
require_grep 'usePetWindowSync' apps/web/src/routes/__root.tsx \
  "routes/__root.tsx no longer opens the desktop pet window"
require_grep 'PetWidget' apps/web/src/routes/pet.tsx "PetWidget is not mounted in routes/pet.tsx"
require_grep 'turnUsageByTurnId' apps/web/src/components/chat/MessagesTimeline.tsx \
  "MessagesTimeline does not render usage badges"
require_grep 'ComposerUsageBadge' apps/web/src/components/chat/ChatComposer.tsx \
  "the composer has no live usage badge"
require_grep 'NeoVersionCard' apps/web/src/routes/settings.tsx \
  "the settings layout has no T3 Neo version card"
require_grep 'themesLocked' apps/web/src/components/settings/SettingsPanels.tsx \
  "the Appearance panel does not lock themes under the Neo look"
require_grep '"Default (Themes)"' apps/web/src/appearanceLook.ts \
  "the standard look is not labeled Default (Themes)"
require_grep 'turnUsageActivity' apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts \
  "ProviderRuntimeIngestion does not emit provider.turn.usage activities"
require_grep 'pet?:' packages/contracts/src/ipc.ts "DesktopBridge lacks the optional pet API"
require_grep 'openPetWindow' apps/desktop/src/ipc/DesktopIpcHandlers.ts \
  "desktop IPC does not register the pet window methods"
require_grep 'pet:' apps/desktop/src/preload.ts "preload does not expose desktopBridge.pet"
require_grep 'Hoppy (Loop)' apps/web/src/neo/pets/petRegistry.ts "rabbit pet label changed"
require_grep 'Wukong (Reactive)' apps/web/src/neo/pets/petRegistry.ts "Wukong pet label changed"
require_grep 'Lunar (No Animation)' apps/web/src/neo/pets/petRegistry.ts "Lunar pet is missing"
require_files apps/web/src/neo/pets/LunarPet.tsx
require_grep "PET_DEFINITIONS" apps/web/src/components/settings/PetSettingsPanel.tsx \
  "the pet settings panel has no pet picker"
require_grep "PetGalleryBrowser" apps/web/src/components/settings/PetSettingsPanel.tsx \
  "the pet settings panel lost the pet gallery browser"
require_grep "ImportedPetCard" apps/web/src/components/settings/PetSettingsPanel.tsx \
  "the pet settings panel does not list imported pets"
for repo in legeling/awesome-codex-pet BeiXiao/awesome-codex-pets eyichan/awesome-codex-pets alterhq/openpets; do
  require_grep "$repo" apps/web/src/neo/pets/petGalleries.ts "pet gallery $repo is missing"
done
require_grep "fetchGallery" apps/desktop/src/preload.ts "preload does not expose desktopBridge.pet.fetchGallery"
require_grep "skipTransformProcessType: true" apps/desktop/src/ipc/methods/pet.ts \
  "the pet window would hide the app's Dock icon on macOS"
require_grep "isTransparentWindow" apps/desktop/src/window/DesktopWindow.ts \
  "appearance syncs would paint a background onto the transparent pet window"
require_grep "resizeWindow" apps/desktop/src/preload.ts "preload does not expose desktopBridge.pet.resizeWindow"
require_grep "fetchPetGallery" apps/desktop/src/ipc/DesktopIpcHandlers.ts \
  "desktop IPC does not register the pet gallery fetch"
require_grep '/settings/neo' apps/web/src/components/settings/settingsSearch.ts \
  "settings search does not know the Neo tab"
require_grep '/settings/pets' apps/web/src/components/settings/settingsSearch.ts \
  "settings search does not know the Pets tab"
require_files \
  apps/web/src/components/settings/PetSettingsPanel.tsx \
  apps/web/src/routes/settings.pets.tsx \
  apps/web/src/neo/pets/LunarPet.tsx
require_grep 'neo-ascii-pet-color' apps/web/src/components/settings/PetSettingsPanel.tsx \
  "the Pets panel has no ASCII pet color select"
require_grep 'agentControlsStyle' apps/web/src/neo/neoSettings.ts \
  "neoSettings lacks the agent controls style"
require_grep 'headerActionsCollapsed' apps/web/src/neo/neoSettings.ts \
  "neoSettings lacks the header actions preferences"
require_grep 'ProcessesButton' apps/web/src/components/chat/ChatHeader.tsx \
  "ChatHeader does not render the Processes button"
require_grep 'organizationRateLimitTier' apps/server/src/provider/Layers/ClaudeProvider.ts \
  "ClaudeProvider does not read the rate limit tier for the plan label"

# --- Feature 5: Processes dialog ---------------------------------------------
require_files \
  apps/web/src/neo/ProcessesDialog.tsx \
  apps/web/src/neo/processGroups.ts \
  apps/web/src/neo/processGroups.test.ts \
  apps/server/src/diagnostics/ProcessOrigins.ts \
  apps/server/src/diagnostics/ProcessOrigins.test.ts
require_grep 'ServerProcessOrigin' packages/contracts/src/server.ts \
  "contracts lack ServerProcessOrigin on the process diagnostics entry"
require_grep 'resolveProcessOrigins' apps/server/src/diagnostics/ProcessDiagnostics.ts \
  "ProcessDiagnostics.read does not attach process origins"
require_grep 'registerProcessOrigin' apps/server/src/provider/Layers/CodexSessionRuntime.ts \
  "CodexSessionRuntime does not register its app-server process"
require_grep 'registerProcessOrigin' apps/server/src/provider/acp/AcpSessionRuntime.ts \
  "AcpSessionRuntime does not register the agent process"
require_grep 'provider: "cursor"' apps/server/src/provider/Layers/CursorAdapter.ts \
  "CursorAdapter passes no process origin"
require_grep 'provider: "grok"' apps/server/src/provider/Layers/GrokAdapter.ts \
  "GrokAdapter passes no process origin"
require_grep 'registerCommandTokenOrigin' apps/server/src/provider/Layers/ClaudeAdapter.ts \
  "ClaudeAdapter does not register the Claude session id"
require_grep 'registerProcessOrigin' apps/server/src/terminal/Manager.ts \
  "the terminal manager does not register PTY processes"
require_grep 'Processes' docs/user/neo.md "docs/user/neo.md lacks the Processes section"

# --- Feature 6: provider fixes ------------------------------------------------
require_grep 'normalizeExitEncoded' packages/effect-acp/src/protocol.ts \
  "effect-acp does not re-file plain JSON-RPC errors as failures"
require_grep 'starting a new session' apps/server/src/provider/acp/AcpSessionRuntime.ts \
  "AcpSessionRuntime does not recover from a rejected session/load"
require_grep 'isCursorPlanLimitReply' apps/server/src/provider/acp/CursorAcpSupport.ts \
  "CursorAcpSupport lacks the plan limit reply detector"
require_grep 'cursorPlanLimitRateLimits' apps/server/src/provider/Layers/CursorAdapter.ts \
  "CursorAdapter does not report the plan limit as a rate-limit window"

if ! git diff --quiet HEAD -- apps/mobile 2>/dev/null; then
  fail "the fork features must not touch apps/mobile"
fi

echo "verify: feature files present"

# --- Batch 4: X animation, updater row, tooltip card, automation -------------
require_grep "spinningXFrames" apps/web/src/neo/pets/petRegistry.ts \
  "petRegistry has no spinning X animation for the No pet preview"
require_grep "useDesktopUpdateState" apps/web/src/components/settings/NeoSettingsPanel.tsx \
  "NeoSettingsPanel does not drive the desktop updater"
require_grep "GithubIcon" apps/web/src/neo/NeoVersionCard.tsx \
  "NeoVersionCard does not use the GitHub icon"
require_files apps/web/src/neo/neoModelDefaults.ts apps/web/src/neo/neoModelDefaults.test.ts
require_grep "applyNeoModelOptionDefaults" apps/web/src/components/chat/composerProviderState.tsx \
  "the composer provider state does not apply Neo model-option defaults"
require_grep "defaultContextWindow" apps/web/src/neo/neoSettings.ts \
  "neoSettings lacks the default context window preference"
require_grep "defaultFastMode" apps/web/src/neo/neoSettings.ts \
  "neoSettings lacks the default fast mode preference"
if grep -q "neo-ascii-spark" apps/web/src/components/sidebar/SidebarChrome.tsx; then
  fail "SidebarChrome still renders the ASCII spark next to the brand"
fi
require_grep "neo-usage-card" apps/web/src/neo/ComposerUsageBadge.tsx \
  "ComposerUsageBadge does not render the tooltip usage card"
require_grep "TooltipPopup" apps/web/src/neo/ComposerUsageBadge.tsx \
  "ComposerUsageBadge does not use the portaled Tooltip primitive"
if grep -q "neo-rabbit-clouds" apps/web/src/neo/pets/RabbitPet.tsx; then
  fail "RabbitPet still renders clouds"
fi
require_files \
  .github/upstream-sync/agent.sh \
  .github/upstream-sync/automation-paths.txt \
  .github/upstream-sync/refresh-upstream-tags.sh \
  .github/workflows/upstream-sync.yml \
  .github/workflows/neo-build-release.yml \
  .github/workflows/neo-issues.yml \
  .github/workflows/neo-refresh-tags.yml \
  .github/ISSUE_TEMPLATE/config.yml \
  .github/ISSUE_TEMPLATE/neo-bug.yml \
  .github/ISSUE_TEMPLATE/neo-feature.yml

vp test run \
  apps/web/src/messageQueueStore.test.ts \
  apps/web/src/components/ChatView.logic.test.ts \
  apps/web/src/composer-logic.test.ts \
  apps/web/src/components/chat/ComposerPrimaryActions.test.tsx \
  apps/web/src/appearanceLook.test.ts \
  apps/web/src/appearanceFonts.test.ts \
  apps/web/src/chevronAnimations.test.ts \
  apps/web/src/neo/neoSettings.test.ts \
  apps/web/src/neo/neoModelDefaults.test.ts \
  apps/web/src/neo/turnUsage.test.ts \
  apps/web/src/neo/processGroups.test.ts \
  apps/web/src/neo/pets/petActivity.test.ts \
  apps/desktop/src/updates/updateChannels.test.ts \
  apps/server/src/orchestration/turnUsage.test.ts \
  apps/server/src/diagnostics/ProcessOrigins.test.ts \
  apps/server/src/diagnostics/ProcessDiagnostics.test.ts \
  apps/server/src/provider/acp/AcpJsonRpcConnection.test.ts \
  apps/server/src/provider/Layers/CursorAdapter.test.ts \
  packages/effect-acp/src/protocol.test.ts

vp run --filter @t3tools/web typecheck
vp run --filter @t3tools/desktop typecheck
vp run --filter @t3tools/server typecheck
vp run --filter @t3tools/contracts typecheck

vp lint --report-unused-disable-directives \
  apps/web/src \
  apps/desktop/src/ipc \
  apps/desktop/src/preload.ts \
  apps/desktop/src/updates \
  apps/server/src/diagnostics \
  apps/server/src/orchestration/turnUsage.ts \
  apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts \
  apps/server/src/provider/Layers/ClaudeAdapter.ts \
  apps/server/src/provider/Layers/ClaudeProvider.ts \
  apps/server/src/provider/Layers/CodexSessionRuntime.ts \
  apps/server/src/provider/Layers/CursorAdapter.ts \
  apps/server/src/provider/Layers/GrokAdapter.ts \
  apps/server/src/provider/acp \
  apps/server/src/terminal/Manager.ts \
  packages/contracts/src/ipc.ts \
  packages/contracts/src/server.ts \
  packages/effect-acp/src/protocol.ts \
  scripts/neo \
  scripts/build-desktop-artifact.ts

vp fmt --check \
  apps/web/src \
  apps/desktop/src \
  apps/server/src/diagnostics \
  apps/server/src/orchestration \
  apps/server/src/provider \
  apps/server/src/terminal \
  packages/contracts/src \
  packages/effect-acp/src \
  scripts \
  docs \
  README.md \
  .github/upstream-sync

echo "verify: ok"
