# T3 Neo features

T3 Neo is a fork of T3 Code. This file is the specification Claude Code follows when it reapplies
the fork's features onto a fresh upstream release. Keep it precise and behavior-focused: it is the
source of truth, `feature.patch` is only the previous implementation.

1. [Queue messages while a turn runs](#feature-1-queue-messages-while-a-turn-runs)
2. [The Neo look](#feature-2-the-neo-look)
3. [T3 Neo branding, repository links, downloads, icon](#feature-3-t3-neo-branding-repository-links-downloads-icon)
4. [Neo settings, pets, usage badges](#feature-4-neo-settings-pets-usage-badges)
5. [Processes dialog](#feature-5-processes-dialog)
6. [Carried fixes](#feature-6-carried-fixes)

Everything is web and desktop only (the desktop app wraps the web client). **Leave `apps/mobile`
untouched.** Server and contract changes are limited to what features 4, 5, and 6 list.

# Feature 1: queue messages while a turn runs

## Behavior

1. **Queue by default.** When a user sends a message on a thread whose turn is still running, the
   message is not sent to the provider. It is queued on the client, and the queue drains one
   message at a time once the thread stops being busy. Each queued message starts its own turn, so
   the agent reads it with the finished work in context. Order is preserved: a message queued while
   other messages are waiting always goes behind them, even if the thread is idle by then.
2. **Busy definition.** A thread is busy while its session status is `running` or `starting`, and
   also while its latest user message has not yet been adopted by a turn (use `hasQueuedTurnStart`
   from `@t3tools/client-runtime/state/thread-settled`). The second case prevents two back-to-back
   queued sends from steering each other.
3. **Force send ("Send now").** The user can bypass the queue at any time:
   - From the composer while a turn runs: a **Send now** action next to the **Queue** button, and
     `Mod+Enter` on web/desktop. This sends the draft immediately with the existing steer
     behavior (`thread.turn.start` while running is a steer; the server and provider adapters
     already handle it).
   - On a queued message: **Send now** sends that message even though the thread is busy.
     **Send all now** releases the whole queue in order.
4. **Discard.** Each queued message can be removed from the queue. Discarding asks for
   confirmation in a small pop-over anchored to the trash control (Cancel / Discard, dismissed on
   click-away or Escape) unless the Neo setting **Confirm before discarding a queued message** is
   off (`queueDiscardConfirm`, default on; `DiscardQueuedMessageButton` in
   `ComposerQueuedMessages.tsx`).
   - The expanded queue never grows past five message rows; any beyond the fifth collapse into a
     single "… +N more queued" summary line (`MAX_VISIBLE_QUEUE_ROWS` in
     `ComposerQueuedMessages.tsx`), so a long queue cannot push the composer off-screen.
5. **Failures.** If sending a queued message fails with a non-transient error, the message stays
   queued with the error shown and a **Retry** action. Transient connection errors retry
   automatically once the environment is connected again.
6. **Persistence and scope.** The queue is device-local. It survives a reload and drains whenever
   the app is open and connected to the environment, even while the user looks at another thread
   or Settings. It is not visible from other devices and the server has no queue concept:
   **do not add server, contract, or provider changes for the queue.**
7. **Toggle.** The Neo settings tab (feature 4) has a **Queue messages while a turn runs** switch.
   When off, the composer behaves like upstream: sending while running steers immediately and the
   composer shows stop + send instead of stop + Queue. `ChatComposer` and `ComposerPrimaryActions`
   take a `queueMessages` boolean; `shouldQueueComposerSubmission` takes `queueEnabled` and returns
   false when it is `false`.

## Surfaces

- `apps/web/src/messageQueueStore.ts`: zustand store persisted in localStorage
  (`t3code:message-queue:v1`), keyed by scoped thread key, ordered by `createdAt`. Exposes
  `enqueue`, `remove`, `markSendNow`, `markThreadSendNow`, `setError`, the hook
  `useQueuedThreadMessages(threadKey)`, and the pure helpers `isThreadBusyForQueue` and
  `resolveQueuedMessageDispatch`.
- `apps/web/src/hooks/useMessageQueueDrain.ts`: mounted once in `routes/__root.tsx`. Watches the
  store, thread shells, and environment connection state; dispatches the head of each thread's
  queue through `threadEnvironment.startTurn` (syncing model selection, runtime mode, and
  interaction mode first, like the mobile outbox does); removes on success; tracks an in-flight
  marker per thread until the shell's `latestUserMessageAt` reflects the sent turn.
- `apps/web/src/components/ChatView.tsx` `onSend`: after attachments are uploaded and before
  local dispatch, `shouldQueueComposerSubmission` (in `ChatView.logic.ts`) decides whether to
  enqueue instead of starting the turn. The queued message stores the fully composed outgoing text
  and prepared attachments, then the composer draft is cleared.
- `apps/web/src/composer-logic.ts`: `ComposerSubmissionIntent` gains `"immediate"`;
  `composerSubmissionIntentForEnter` returns it for `Mod+Enter` on a running server thread.
- `apps/web/src/components/chat/ComposerPrimaryActions.tsx`: while running with sendable
  content and queueing enabled, render the stop button plus a **Queue** submit button
  (`aria-label="Queue message"`) with a menu containing **Send now** (`onSendNow`).
- `apps/web/src/components/chat/ComposerQueuedMessages.tsx`: banner above the composer listing
  queued messages with **Send now**, **Send all now**, and discard actions, collapsible with a
  chevron to one badge-high row ("3 queued"). Rendered by `ChatComposer.tsx` inside the banner
  column.
- Docs: `docs/user/composer.md` has a "Queued messages" section; `docs/internals/glossary.md`
  defines **Steer** and **Queued message**.

## Tests that must exist and pass

- `apps/web/src/messageQueueStore.test.ts`: store ordering and persistence, `isThreadBusyForQueue`,
  `resolveQueuedMessageDispatch` (wait/send/drop matrix including `sendNow` and `error`).
- `apps/web/src/components/ChatView.logic.test.ts`: `shouldQueueComposerSubmission` cases
  (running queues; immediate and draft threads never queue; non-empty queue keeps order; unadopted
  user message queues; idle sends; `queueEnabled: false` never queues).
- `apps/web/src/composer-logic.test.ts`: `Mod+Enter` while running returns `"immediate"`.
- `apps/web/src/components/chat/ComposerPrimaryActions.test.tsx`: running + content renders
  Queue, running + empty renders only Stop.

# Feature 2: the Neo look

A toggleable whole-interface redesign, selected in Settings → Appearance → **Look** with the
labels **Default (Themes)** and **Neo**. **Neo is the default look** for new clients. It is a look,
not a theme: it changes typography, shapes, and surfaces, and it owns its own palette in both light
and dark appearance. While Neo is active the theme library (grid, Create theme, Add theme) is
hidden and replaced by a short note; only the appearance mode tiles (system, light, dark) stay.
`ThemeLibrary` takes `themesLocked` for this.

## Design language (describe, never name a source)

- **Canvas and text.** Dark appearance: a warm near-black canvas (`#110f0d`), slightly darker
  chrome/sidebar (`#0c0b0a`), warm dark cards (`#171412`), cream text (`#ffedd9`), muted text in
  warm gray (`#a4958a`). Light appearance: a warm sand canvas (`#ede5da`), darker sand chrome
  and sidebar (`#e4dbcd`), cream cards (`#f6f0e7`), near-black brown ink (`#17110d`), muted text
  `#5f5044`; borders at 16% and input borders at 26% of the ink so it reads with real contrast.
- **One accent.** Amber orange: `#f2a26e` on dark, `#c8641f` on light. It drives primary buttons,
  the send/queue action, focus rings, switches, selection, and the warning/update roles. No blue
  anywhere, including the sidebar: sidebar tokens (`--sidebar-*`) are set to the same warm
  palette (in dark appearance the sidebar text is a dimmer cream, `#d4c5b4`, with muted text
  `#9a8b7d`, so the long column of labels and icons does not glare; the column also maps
  `--foreground` to `--sidebar-foreground`), and the sidebar header carries a static amber starfield (`NeoStarfield`, feature 3) with a thin star sky (`NeoStarSky`, feature 3) over the rest
  behind the branding. Both sidebar toggles (`SidebarChrome` and `AppSidebarLayout`'s
  `SidebarControl`) pass `!neoLook` into the stage-backdrop resolution, so under Neo they keep the
  plain ghost hover in both sidebar states instead of the lighter white-on-artwork hover.
- **Flat, bordered surfaces.** No glass blur or translucency. Cards, popups, dialogs, tooltips,
  toasts, and the composer are solid surfaces with a 1px hairline border and a soft, deep shadow.
- **Pill shapes.** Buttons, toggles, badges, toolbar controls, menu triggers, sidebar rows, and
  tooltips are fully rounded. Inputs use a 0.75rem radius; cards and popups 1rem; the composer
  18px; dialogs 1.25rem.
- **Typography.** A grotesk sans stack (`"Schibsted Grotesk", "Inter Tight", "Inter",
"Helvetica Neue", ...`) with slightly negative tracking; headings light (h1 weight 300, h2 400,
  letter-spacing -0.03em); a monospace stack led by `"JetBrains Mono"`. Small section labels are
  uppercase, 0.68rem, semibold, letter-spacing 0.08em.
- **Chrome.** The sidebar is a solid column with a hairline right edge. The chat header has a
  hairline bottom border and pill controls with borders. A faint static amber radial glow sits
  behind the top of the workspace.
- **Motion.** Only stepped, low-frequency animation: star twinkle uses `steps()` with long
  intervals and is disabled under `prefers-reduced-motion`. No continuously repainting effects.
- **Everything else stays functional and familiar**: same layout, same components, same
  interactions. The look must not remove or move features.
- **Details that matter.** Tooltips are softly rounded (0.85rem), never pills: the sidebar thread
  preview carries several lines. Split buttons (`[data-slot="group"]`: Open, Commit, scripts) are
  one pill: the group owns border and radius, the segments inside are flat with a hairline
  separator. The composer send button uses the accent, not the environment stage artwork.

## Implementation

- `apps/web/src/appearanceLook.ts`: `APPEARANCE_LOOKS = ["neo", "default"]`,
  `DEFAULT_APPEARANCE_LOOK = "neo"`, labels `{ neo: "Neo", default: "Default (Themes)" }`,
  `readStoredAppearanceLook(storage?)` (legacy value `"ember"` maps to `"neo"`, unknown values fall
  back to the default), `applyAppearanceLook(root, look)` (sets `data-look` on `<html>` for `neo`,
  removes it for `default`), `setAppearanceLook`, and `useAppearanceLook()` (useSyncExternalStore,
  follows other tabs via the `storage` event). Stored in localStorage under
  `t3code:appearance-look`, per client like the theme.
- `apps/web/index.html`: the inline pre-paint script reads that key and sets
  `document.documentElement.dataset.look = "neo"` unless the stored value is `"default"`, so a
  reload never flashes the other look. The document title is `T3 Neo (Alpha)`.
- `apps/web/src/routes/__root.tsx`: applies the look next to the contrast setting.
- `apps/web/src/looks/neo.css`: plain CSS (not a Tailwind entry, so no `@variant`/`@apply`),
  imported from `main.tsx` right after `index.css` so its equal-specificity selectors win. All
  rules are scoped under `html[data-look="neo"]`; dark rules use `html[data-look="neo"].dark`. It
  overrides the semantic tokens (`--background`, `--card`, `--primary`, `--sidebar-*`, `--code-*`,
  `--terminal-*`, `--glass-*`, `--radius`, `--control-radius`, fonts) and restyles hooks that
  already exist: `[data-slot="button"|"input"|"menu-popup"|"dialog-popup"|...]`,
  `[data-app-sidebar]`, `[data-thread-item]`, `[data-chat-header]`, `[data-slot="composer-shell"]`
  and friends, `.chat-markdown`. Also beats an active custom theme by matching
  `html[data-look="neo"][data-theme-id]:root`.
- `apps/web/src/components/settings/SettingsPanels.tsx` (Appearance panel): a **Look** row with a
  `Select` (Default / Neo) and a reset button, registered in `settingsSearch.ts` as
  `appearance-look`.
- **Bundled interface font.** `@fontsource/schibsted-grotesk` is a web dependency; `main.tsx`
  imports the 400/500/600/700 normal and 400 italic weights before `looks/neo.css`, so the Neo
  sans stack renders on machines without the font installed.
- **Interface font picker.** `appearanceFonts.ts` exports `NEO_SANS_FAMILY`
  (`"Schibsted Grotesk"`), `SYSTEM_SANS_FAMILY` (`"system-ui"`, a CSS keyword because the
  platform face is not nameable), the `FontFamilyChoice` type, `resolveSansFontChoices({ look,
systemFamily })`, and `resolveSansFamilyLabel(preference, choices)`. The choices are two pinned
  rows at the top of the **Interface font** picker, in this order: Schibsted Grotesk with a
  semi-transparent accent badge **Neo Default**, and the probed platform face (e.g. "SF Pro") with
  a semi-transparent gray badge **Default**. Under Neo the empty preference is Schibsted Grotesk and
  the platform row stores `system-ui`; under Default (Themes) the empty preference is the platform
  face and the Neo row stores `"Schibsted Grotesk"`. `FontFamilyPicker` takes an optional
  `choices` prop (pinned rows with badges; installed fonts matching a pinned row are not listed
  twice; the trigger shows the pinned row's display name); `FontFamilySettingsRow` passes it
  through from `InterfaceFontRow`. `useFontDefaultFamilies` is look-aware, and the prompt font's
  inherited default label comes from `resolveSansFamilyLabel`.
- **Chevron animations** (Settings → Appearance, Neo badge, switch, default on, registered in
  `settingsSearch.ts` as `appearance-chevron-animations`): a vertical chevron (`.lucide-chevron-down`
  / `.lucide-chevron-up`) inside a popup trigger stays as drawn while the popup is closed and
  turns 180° (160 ms transform transition, none under `prefers-reduced-motion`) only while the
  popup is open (`[data-popup-side][data-popup-open]`). A closed chevron is never rotated, so a
  trigger whose popup flips sides cannot look stuck upside down. Applies in both looks. `apps/web/src/chevronAnimations.ts` mirrors
  `appearanceLook.ts` (localStorage `t3code:chevron-animations`, values `on`/`off`;
  `readStoredChevronAnimations`, `applyChevronAnimations(root, enabled)` sets
  `data-chevron-animations="off"` on `<html>` only when off, `setChevronAnimations`,
  `useChevronAnimations`); `index.html` applies a stored `off` before first paint and
  `routes/__root.tsx` keeps it in sync. `components/ui/popupSide.tsx` gives the trigger its popup's
  configured side as `data-popup-side`: `PopupSideProvider` (one mutable record per root),
  `usePopupTriggerRef(ref)` (trigger callback ref, merges the caller's ref), and
  `usePublishPopupSide(side)` (effect in the popup wrapper). The `Menu`, `Popover`, `Select`, and
  `Combobox` roots in `components/ui` wrap their Base UI root in the provider, their `*Trigger`
  wrappers register, and their `*Popup` wrappers publish `side`. The CSS block "Chevron
  animations" in `neo/neo.css` rotates by `[data-popup-side="bottom|top"]` and Base UI's
  `[data-popup-open]`; horizontal popups (submenus) are untouched. `usePublishPopupSide` returns
  a ref for the `*Positioner`; while open, a `MutationObserver` on its `data-side` publishes the
  side Base UI actually chose (a collision flip), and that observed side outranks the configured
  one from then on. The composer's model picker (`ProviderModelPicker`) and runtime-mode select
  (`ChatComposer`) pass `side="top"` since they always open upward.
- **Agent controls** (Settings → Appearance, Neo badge, `Select` with **Top bar style** /
  **Default style**, default top bar, registered in `settingsSearch.ts` as
  `appearance-agent-controls`; stored as `agentControlsStyle: "topbar" | "default"` in
  `neoSettings.ts`, labels in `AGENT_CONTROLS_STYLE_LABELS`): how the composer footer's model,
  traits (context window, fast mode), and Build/Plan and access controls look. `ChatComposer`
  sets `data-neo-agent-controls={agentControlsStyle}` on the footer (`[data-chat-composer-footer]`);
  each control carries upstream's `data-composer-control` (`ComposerControl.tsx`). The CSS block
  "Agent controls" in `neo/neo.css` gives `topbar` controls the header pill (1px
  `var(--contrast-border)`, `var(--control-radius)`, `var(--toolbar-control)` surface, hover
  `var(--toolbar-control-hover)`; an `[data-active]` control such as Plan mode keeps the filled
  accent), hides the hairline separators between them and widens the gap to 0.375rem. `default`
  keeps upstream's ghost buttons. Applies under both looks.
- Docs: `docs/user/appearance-looks.md` (including the interface font and Agent controls
  paragraphs), `docs/user/neo.md` ("Chevron animations"); glossary entry **Look**.

## Tests that must exist and pass

- `apps/web/src/appearanceLook.test.ts`: stored-value parsing (including the `ember` alias and the
  Neo default), `isAppearanceLook`, `applyAppearanceLook` sets and clears the root tag. DOM-free
  (pass a storage stub and a plain `{ dataset }` object).
- `apps/web/src/appearanceFonts.test.ts`: `resolveSansFontChoices` for both looks (order, values,
  badges, `system-ui` as the platform row's CSS) and `resolveSansFamilyLabel`.
- `apps/web/src/chevronAnimations.test.ts`: stored-value parsing (on unless exactly `off`) and
  `applyChevronAnimations` marking the root only when off.

# Feature 3: T3 Neo branding, repository links, downloads, icon

## Behavior

1. **Name.** The product is called **T3 Neo** everywhere a user can see it: window title, sidebar
   brand, About/Settings, release names, desktop artifact names (`T3-Neo-<version>-<arch>.<ext>`),
   `productName` in `apps/desktop/package.json`, the web title, and docs written for this fork.
   Provider names, upstream credits, and CLI package names stay as upstream ships them.
2. **Repository links.** The fork repository is `xibn/t3neo` by default and overridden at build
   time by `VITE_T3NEO_REPOSITORY` (the workflow passes `github.repository`). A slim pill card
   above every settings tab (`NeoVersionCard`, rendered by `routes/settings.tsx` inside the same
   `max-w-4xl` + padding frame as the settings content so it is exactly as wide: "T3 Neo vX.Y.Z"
   with an **Open Repository** button (GitHub icon) on the right, nothing else; the card sits in
   a scroller with the same both-edge scrollbar gutter as the tabs) opens the repository in the
   browser (external link, `desktopBridge.openExternal` on desktop). The sidebar footer carries
   no badge or version: the utility icons sit flush at the bottom.
3. **Downloads and updates.** The Neo settings tab has an **Updates** row. On desktop it drives
   the built-in updater through `desktopBridge` (`useDesktopUpdateState` +
   `checkForUpdate`/`downloadUpdate`/`installUpdate`: "Check for updates", "Download update",
   "Restart to update", with the version and download percentage as text), so the installed app
   updates in place from the fork's releases instead of handing out a new installer. In the web
   app the same row resolves the newest GitHub release of the fork and links straight to the
   asset for the current platform (macOS arm64/x64 `.dmg`, Linux `.AppImage`, Windows `.exe`),
   falling back to the release page. Desktop update release links point at the fork's releases,
   not upstream's; the release assets include the updater manifests and blockmaps. macOS signing
   has three tiers in `neo-build-release.yml`: full Apple credentials → `--signed` (signed and
   notarized, passkey entitlements); only `CSC_LINK` + `CSC_KEY_PASSWORD` → `--self-signed`
   (`scripts/build-desktop-artifact.ts` option `selfSigned`, env `T3CODE_DESKTOP_SELF_SIGNED`:
   signs with the certificate in the keychain, which may be self-signed, sets `mac.notarize: false`,
   skips the passkey/provisioning-profile configuration, keeps the CSC env but drops `APPLE_*`;
   a full `--signed` wins over it); nothing → unsigned. Self-signed builds update in place because
   Squirrel accepts updates signed with the running app's certificate; their first launch needs
   Gatekeeper's "Open Anyway" once.
4. **Sidebar header.** Under the Neo look, the sidebar's top-left branding sits on a static amber
   starfield (an inline SVG with small stars, thin rings, and five larger embers that breathe in
   stepped keyframes; `preserveAspectRatio="xMidYMin slice"` with the rings and glow just left of
   the horizontal center, behind the moon). The art is twice the header height: the top half is
   the header, where the three rings (r 24/36/48 on a 480×192 viewBox) complete inside the
   header without being cut, and the bottom half is a tail of stars whose density drops quickly
   below the header. The backdrop (`.neo-sidebar-backdrop`) is
   `calc(var(--workspace-topbar-height) * 2)` tall with a `mask-image` that stays solid over
   the header and fades to transparent by 90 %, so the field relaxes into the sidebar over a
   short distance instead of stopping at the header's edge. The brand itself is a moon-star icon in `#f1a629`
   with a stepped ember glow, the T3 wordmark, and "Neo", absolutely centered in the header under
   the Neo look (no spark, no other decoration). The art has no sky fill of its own and no fade mask: the header shows the sidebar's
   background in both schemes, so header and star sky below it are one continuous surface.
   Stars twinkle in a few stepped groups; the starfield is hidden
   under the Default look and nothing animates continuously. **Star sky.** `NeoStarSky`
   (`NeoStarfield.tsx`, class `neo-star-sky`) scatters tiny star shapes over two hosts only, never
   the chat: the sidebar below the header (`variant="sidebar"`, 56 stars over the whole column with
   only a slight pull towards the top, `biasY: 1.1`, mounted in `AppSidebarLayout` with class
   `neo-sidebar-trail` for the header offset) and the chat top bar (`variant="topbar"`, 26 stars
   spread evenly plus a 9-star cluster in the top-right corner at x 86..97 % / y 10..94 %, so some
   sit under the floating buttons and the slim collapsed header still shows a few, inside
   `WorkspacePageHeader` in `ChatView`). The counts live in `SKY_VARIANTS` in `NeoStarfield.tsx`. Shapes: four-point concave sparkle, five-point
   star filled and outlined, eight-point burst, and dots; 2 to 7 px, small enough to read as glints
   rather than icons; deterministic seeded layout per variant. Each star has its own resting
   opacity (`--dim`, 0.3 to 0.65) and halo strength (`--glow`, a radial `::before` disc of the
   star's color) and is warm `#f2a26e` or bright `#ffd9a8` (light scheme: `#a4530f` / `#7a3d10` at
   60 % layer opacity). About 35 % twinkle (`neo-sky-twinkle-0/1/2`: 6.4 s / 8.8 s / 11.6 s,
   `steps(8..10)`) and 20 % flare (`neo-sky-flare-0/1`: 13 s / 17 s, one brief glint), each with a
   seeded `animation-delay`; the rest are still. No shooting stars. Hidden under the Default look
   (`display: none` unless `html[data-look="neo"]`) and all motion off under
   `prefers-reduced-motion`. It replaces the earlier dotted `NeoStarTrail`. The content panel behind the chat carries a
   faint static ember dot grid on the body below the top bar
   (`[data-slot="sidebar-inset"] > div > div > header + div`). The sidebar draws no right edge and the
   top bar draws no bottom line of its own; instead the content body carries one continuous
   outline — `border-top` and `border-left` in `var(--contrast-border)` that wrap into a
   `border-top-left-radius: 1.5rem` — so the line under the top bar, the rounded corner, and the
   line beside the sidebar are a single stroke (the same idea as a curved SVG corner stroke, done
   in CSS). The inset behind it is the darker frame colour (`background-color: var(--sidebar)`)
   and the body is the lighter surface (`var(--background)`), so the frame shows through the
   corner as well. The sidebar
   column pins `--sidebar` to `--neo-sidebar` (`#0c0b0a` dark, `#dcd2c3` light) on
   `[data-app-sidebar]` because themes and the dark scheme reassign it at the root; it must never
   be lighter than the content body. The thread list's "Working" status renders in the accent,
   not sky blue.
5. **Icon.** The app icon is the lucide `moon-star` glyph in amber (`#f2a26e`) on a warm dark
   rounded square. `scripts/neo/generate-neo-icons.ts` renders every production icon slot
   (`assets/prod/black-*-1024.png`, `t3-black-windows.ico`, web favicons and Apple touch icon,
   `assets/prod/logo.svg`, `apps/web/public/*`) plus `assets/neo/app-icon.svg`. Run it if any
   icon file is missing or still shows upstream's icon.
6. **README download button.** `assets/neo/download-button.svg` (a static pill button image) and
   `docs/download/index.html` (a self-contained page that detects the visitor's OS, reads the
   latest fork release from the GitHub API, and links or redirects to the matching asset; the
   repository slug comes from the GitHub Pages URL, with a `repo` query override). The README
   starts with a T3 Neo section that embeds the button linking to that page.
7. **README screenshots.** `assets/neo/screenshots/header-collapsed.jpg` (a chat in the Neo
   look with the header actions folded away) and `pets.jpg` (the pet settings, "No pet"
   selected), embedded under a "Screenshots" heading in the T3 Neo README section. The README
   section itself is a short technical bullet list of the fork's features (Neo look, message
   queue, usage badges, collapsible header, pets, Neo settings "and more") with no release or
   automation prose. Retake the captures when the UI changes: 1440×900 CSS px at 2× (2880 px
   wide) JPEGs, dark appearance, no toast, no pet overlay.
8. **Nightly builds.** Upstream nightlies (`vX.Y.Z-nightly.<date>.<run>`) can be rebuilt as T3 Neo
   nightlies on demand. Their version is `X.Y.Z-nightly.neo.<date>.<run>`: `nightly` stays the
   first pre-release word because the desktop updater reads the update channel from it, and `neo`
   follows. Both channel detectors, `resolveDesktopUpdateChannel` in
   `scripts/build-desktop-artifact.ts` and `updateChannels.ts` in the desktop app, accept the
   optional `neo.` segment (`/-nightly\.(?:neo\.)?\d{8}\.\d+$/`), so such a build packages as
   the nightly channel: product name `T3 Neo (Nightly)`, `nightly*.yml` updater manifests, and
   upstream's nightly icon and DMG artwork (the fork ships no nightly artwork of its own). Stable
   versions `X.Y.Z-neo.<n>` stay on the latest channel. Nightly releases are GitHub pre-releases
   and never "latest", so stable installs, the Updates row, and the download page never see them;
   only desktop installs on the Nightly update channel do.

## Implementation

- `apps/web/src/neo/neoRepository.ts`: `NEO_PRODUCT_NAME`, `NEO_REPOSITORY`,
  `NEO_REPOSITORY_URL`, `NEO_RELEASES_URL`, `NEO_LATEST_RELEASE_API_URL`,
  `detectNeoDownloadPlatform`, `pickNeoReleaseAsset`.
- `apps/web/src/neo/neoRelease.ts`: `fetchLatestNeoRelease` (cached), `useLatestNeoRelease`,
  `neoDownloadForCurrentPlatform`.
- `apps/web/src/neo/NeoBadge.tsx`, `apps/web/src/neo/NeoStarfield.tsx`, `apps/web/src/neo/neo.css`
  (fork-specific styles that apply under both looks: badge, starfield, pets).
- `apps/web/src/branding.ts` fallback name, `apps/desktop/src/app/DesktopEnvironment.ts`
  `APP_BASE_NAME`, `scripts/build-desktop-artifact.ts` product and artifact names,
  `apps/web/src/components/desktopUpdate.logic.ts` release URLs.
- `apps/web/src/components/sidebar/SidebarChrome.tsx`: starfield backdrop in the header when the
  Neo look is active; the footer carries no badge or version (`NeoBadge` is used by the settings
  panels only).

# Feature 4: Neo settings, pets, usage badges

## Chevron animations and the collapsed top bar

- **Chevron animations** (`neo/neo.css`, Settings → Appearance switch, `html[data-chevron-animations="off"]`
  disables): a vertical chevron inside a popup trigger stays as drawn while the popup is closed
  and rotates 180° only while its popup is open (`[data-popup-side][data-popup-open]`). The
  trigger's `data-popup-side` (from `components/ui/popupSide.tsx`) only opts it in; it must
  never rotate a closed chevron, otherwise triggers whose popup flips sides look stuck upside
  down. Transition 160 ms, none under reduced motion.
- **Collapsed header actions** (`neoSettings.headerActionsCollapsed`, the header carries
  `data-neo-header-collapsed`): modelled on a browser-tab header. Under Neo the top bar becomes
  a 14px strip (`--workspace-topbar-height: 0.875rem`, `overflow: visible`) that carries
  nothing: the thread breadcrumb (`[aria-label="Thread breadcrumb"]`) is hidden, and the header
  actions cluster (`[data-chat-header-actions]`, which holds the show/hide toggle) floats
  absolutely at `top: 0.375rem; right: 0.5rem` in the strip colour (`var(--sidebar)`) with a
  `border-bottom-left-radius: 0.75rem`, over the card's top-right corner; the titlebar panel
  controls (`[data-workspace-titlebar-controls]`) float at the same top. The workspace below
  becomes the card: `border-top-left-radius` and `border-top-right-radius` both `0.75rem`, and
  the outline (`border-top`/`border-left` from the normal state plus `border-right`) wraps all
  three visible edges. The Default look keeps the generic `max(2rem, env(titlebar-area-height,
0px))` strip from `neo/neo.css`.

## Neo settings tab

Two settings tabs. **Neo** (moon-star icon, route `/settings/neo`, `NeoSettingsPanel.tsx`,
`routes/settings.neo.tsx`) is grouped into labelled `SettingsSection` categories (Updates, Chat,
Message queue, New chat defaults, Composer), each with an icon, rather than one long list.
**Pets** (paw icon, route `/settings/pets`, `PetSettingsPanel.tsx`, `routes/settings.pets.tsx`)
holds everything about the pet: picker, size, working animation interval, ASCII color. Both are
registered in `settingsSearch.ts` (ids prefixed `neo-`).

The **Neo** tab has:

1. The **Updates** row (feature 3).
2. **Show usage badges** switch (default on), **Queue messages while a turn runs** switch
   (default on), and **Keep the composer expanded** switch (default off): on, the composer editor
   grows with its text (a wrapped line or a newline, never on the first character) up to eight
   lines and holds the tallest height reached until the draft is empty, so deleting lines or
   leaving focus does not shrink it. `ChatComposer` sets `data-neo-composer-expanded` on the
   composer form while the switch is on and the draft has text, and after each draft change
   writes the maximum `scrollHeight` seen on `[data-testid="composer-editor"]` to the CSS variable
   `--neo-composer-held-height` on the form (removed when the draft is empty). `looks/neo.css`
   applies `min-height: clamp(4.375rem, var(--neo-composer-held-height, 0px), calc(8 * 1.625em))`
   and `max-height: calc(8 * 1.625em)` to the editor under that attribute. With the switch **off** (the default),
   the Neo look instead keeps the composer compact — the editor's minimum height is `2rem` and the
   editor's content wrapper (upstream `pt-4`/`pb-2`) has its vertical padding roughly halved to
   `0.5rem`/`0.25rem` — so a one-line message keeps about half the default air above and below it
   and the model row sits just under the text
   (`html[data-look="neo"] :not([data-neo-composer-expanded]) [data-testid="composer-editor"]` and
   `[data-chat-composer-surface] > div:has([data-testid="composer-editor"])`). The composer footer's single-button pills
   (model, effort, runtime mode) get a hairline divider before their dropdown chevron so they read
   like the split **Open** and **Commit** buttons in the top bar. The divider is a
   `background-image` gradient on the button (`button:has(svg.lucide-chevron-down)` in
   `looks/neo.css`, 1px × 1.5rem at `right 1.75rem center`), never a border on the SVG, so it
   stays put while the chevron rotates; the SVG only gets `margin-left: 0.5rem`.
3. **Header actions button** switch (default on) and **Collapse header actions** switch (default
   off), registered in `settingsSearch.ts` as `neo-header-actions-toggle` and
   `neo-header-actions-collapsed`. `ChatHeader` takes `actionsToggle`, `actionsCollapsed`, and
   `onToggleActionsCollapsed`: with the toggle on it renders, after `GitActionsControl` at the
   end of `[data-chat-header-actions]` (the row starts with the Processes button, feature 5), a
   ghost `Toggle` (`data-chat-header-actions-toggle`,
   aria-label "Hide header actions" / "Show header actions") showing `ChevronsRightIcon` while
   expanded and `ChevronsLeftIcon` while collapsed; while collapsed the Processes button, project
   scripts, Open In picker, `extraActions`, and git actions are not rendered and only that button
   remains (the breadcrumb stays). `ChatView` passes both settings and toggles `headerActionsCollapsed`, and
   sets `data-neo-header-collapsed` on the `WorkspacePageHeader` (`[data-chat-header]`) while
   collapsed. CSS in `neo/neo.css` ("Collapsed header actions"): the header's
   `--workspace-topbar-height` becomes `max(2.25rem, env(titlebar-area-height, 0px))` and its
   background the chrome color, and the main content area that follows it (`[data-chat-workspace]`
   in `ChatView`, holding the chat column and the right panel) gets 1rem top corner radii with
   `overflow: clip`. Applies under both looks.
4. **Default context window** select (Biggest / Smallest, default **Smallest**) and **Default fast
   mode** select (Fastest / Slowest, default **Slowest**). When a new chat's model exposes a
   `contextWindow` select or a `fastMode` boolean option, the composer starts on the chosen
   default instead of the provider's. Implemented as a pure bias over the model's option
   descriptors (`apps/web/src/neo/neoModelDefaults.ts`, `applyNeoModelOptionDefaults`): the
   biggest/smallest context window is chosen by parsed token counts when the options carry them,
   else by provider order (first smallest, last biggest); fast mode maps fastest→on, slowest→off.
   The bias only sets the descriptors' `currentValue`, so a thread that already has a saved
   selection keeps it — it applies to fresh chats only. It is threaded through
   `getComposerProviderState` (dispatch and the `resolveAppModelSelectionState` seed in
   `modelSelection.ts`) and `getSelectedTraits` (the picker display), never into core provider
   code.
5. **Branch manager position** select (Below composer / In the header, default below) and
   **Show the branch manager move pill** switch (default on). In the header the whole
   strip is one bordered pill of the same height and surface as the **Open** and **Commit**
   pills next to it (`.neo-branch-toolbar-header` rules in `neo/neo.css`): checkout, branch, and
   the branch chevron are flat segments separated by hairlines, the chevron a 24 px segment of
   its own exactly like the Open and Commit chevrons, labels visible. The branch manager is the
   workspace + branch strip (`BranchToolbar`). `ChatView` builds it once and docks it either in
   the composer context strip or in the chat header right after **Open** (`ChatHeader`
   `extraActions`). With the pill on, an amber pill (`.neo-branch-move`, arrow-up-to-line icon,
   label "Header") next to the workspace control lifts it into the header; docked in the header,
   the same pill (arrow-down-to-line, "Below composer") sits at the bottom of the branch popup
   (`BranchToolbarBranchSelector` `popupFooter`) and sends it back.
6. On desktop, an **Open pet window** action that detaches the pet into its own window.

The **Pets** tab has:

1. **Pet** picker: a grid of cards (`sm:grid-cols-2 lg:grid-cols-4`, so all four sit in one
   row on wide screens) with a live preview animation for each option: **No pet**
   (an ASCII animation of a 3D letter X spinning about its vertical axis: `spinningXFrames`
   renders 32 frames of 25×11 cells with three-cell-wide bars and `@`/`#`/`+` glyphs by depth,
   70 ms per frame, so the X reads as a solid block), **Hoppy (Loop)** (the rabbit),
   **Wukong (Reactive)**, and **Lunar (No Animation)**. Previews tour every mood on a timer
   (idle → typing → working, ~4 s each) and rotate working clips faster than the live pet.
2. **Pet size** slider (32 to 360 px, default 160, step 4) and **Working animation
   interval** (seconds between Wukong's working clips, `neo-pet-working-interval`).
3. **ASCII pet color** select (System / Light / Dark, default **System**) in the Pets panel below
   Pet size, registered in `settingsSearch.ts` as `neo-ascii-pet-color`. The ASCII pets (the X
   and Wukong) draw their glyphs in `--neo-ascii-pet-dark` (`#f1a629`, the ember amber) on a
   dark appearance and `--neo-ascii-pet-light` (`#c8641f`, the light accent orange, the slider
   color) on a light one; both variables live on `:root` in `neo/neo.css`. Light / Dark pin one
   color: `routes/__root.tsx` calls `applyAsciiPetColor(document.documentElement, choice)` from
   `neoSettings.ts`, which sets `data-neo-ascii-color="light|dark"` on `<html>` (removed for
   System), and `neo.css` overrides `.neo-ascii-pet` color under that attribute while the text
   halo keeps following the appearance. Next to the select sits a round swatch (`.neo-ascii-swatch`
   with `data-choice`) that previews the color; for System it is split on a 135° diagonal, light
   accent on the upper-left half and amber on the lower-right. Each select item carries the same
   swatch.

Settings live in `apps/web/src/neo/neoSettings.ts`: a zustand store persisted in localStorage
under `t3code:neo-settings:v1` with `{ usageBadges, queueMessages, queueDiscardConfirm, pet,
petSize, petPosition, petWorkingIntervalSec, asciiPetColor, composerExpanded,
headerActionsToggle, headerActionsCollapsed, branchToolbarPosition, branchToolbarMoveButton,
defaultContextWindow, defaultFastMode, agentControlsStyle }` (every key optional in the stored
schema, missing keys fall back to `DEFAULT_NEO_SETTINGS`),
`useNeoSettings`, `useUpdateNeoSettings`, `readStoredNeoSettings`, `clampPetSize`, and a
`NeoSettingsStorage` interface with `createMemoryNeoSettingsStorage()` for tests. Per client, no
contracts or server settings.

## Pets

1. **Pets.** `apps/web/src/neo/pets/petRegistry.ts` defines `none`, `rabbit`, `wukong`, and `lunar`.
   - **Lunar (No Animation)** (`LunarPet.tsx`) is the brand's moon-star in `#f1a629` inside the
     starfield's ring glow (radial glow plus three thin `#f2a26e` rings at 14 % opacity), drawn
     once with no background and nothing that moves, for people who find the animated pets too
     much but still want the badge, the hover activity list and click-to-open. Its card
     description is the one-liner "No pet, just the status: the badge and the activity list
     stay."
   - The rabbit ("Hoppy") is a pure CSS scene measured in `em` (`RabbitPet.tsx` + `.neo-rabbit*`
     in `neo/neo.css`): an egg-shaped body (`border-radius: 70% 90% 60% 50%`) shaded by a
     radial gradient from fur to a warm fur-shade at the rim, with the tail, eye plus eye
     highlight, a warm-pink nose, a soft cheek blush, and feet drawn as box-shadows of one
     pseudo-element; ears as the other pseudo-element, the front ear showing a pink inner ear via
     a vertical gradient stripe. The body's edge is a faint warm 1px drop-shadow, not black, and
     the pet widget's dark backdrop shadow (`.neo-pet-sprite` filter) is turned off for the
     rabbit (`.neo-pet-sprite:has(.neo-rabbit-scene) { filter: none }`); the ASCII pets keep it.
     There are no clouds and no shadow under the body. Keyframes `neo-rabbit-hop` (a 1.5 s eased
     arc: crouch, rise, tilt, land with a squash) and `neo-rabbit-kick` (feet box-shadows) loop
     smoothly; nothing is stepped or jerky.
   - Wukong is an ASCII monkey drawn from frame JSON files (`apps/web/src/neo/pets/frames/*.json`,
     loaded lazily). Moods: **sleeping** while the user is not typing, **typing** while the user
     types in the chat composer, **working** while any thread runs; the working state rotates
     through several clips semi-regularly (about every 9 s) in shuffle-bag order
     (`createWorkingClipShuffle`: every clip once before any repeats, never the same clip twice
     in a row).
   - A thread with queued messages counts as running for the pet, so Wukong keeps working between
     one turn finishing and the next queued message starting.
   - ASCII frames always fit: `AsciiAnimation` measures the monospace cell width once, sizes the
     font from the widest frame, and below a 6 px font scales the block with a transform instead
     of clipping. Nothing is cut off at 32 px.
   - Frames step with `setInterval`, pause when the document is hidden, and stop under
     `prefers-reduced-motion`. `.neo-ascii-pet` glyphs are bold (`font-weight: 700`) with a
     hairline `-webkit-text-stroke` in `#f1a629` so the monkey stays visible over busy content.
2. **Visibility.** The pet has a transparent background but must read on any surface: ASCII pets
   render in the exact ember amber `#f1a629` with a dark halo (text shadow) in dark appearance
   and the same amber with a mixed halo in light appearance.
3. **Placement.** The pet floats above the app (`PetWidget mode="overlay"`, mounted in
   `routes/__root.tsx` when authenticated), draggable with a 4 px threshold; its position persists.
   Size comes from settings. The sidebar footer has a paw-print **Pet** button (`SidebarPetButton`
   in `SidebarChrome.tsx`, a `SidebarUtilityItem` like Settings and Usage) next to the existing
   footer buttons that navigates straight to `/settings/pets`; it is filled in the primary color
   while a pet other than "none" is selected. It opens no menu.
4. **Badge.** Two round pills (`.neo-pet-controls` > `.neo-pet-control`, 28 px) always sit under
   the pet. The first is the badge (`petBadgeFor`): the number of running threads while any run, a
   check icon when a thread finished while the user was not looking at it, and `0` otherwise (the
   `PetBadge` type has only `count` and `done`). The second is the fold toggle for the bubble's
   run list (`aria-expanded`, "Show all runs" / "Show one run at a time"): always rendered and
   always enabled; `expanded` is plain component state that is never reset by the run count, so
   the choice survives quiet spells. Viewing a thread clears its unseen state.
5. **Click and hover.** Clicking the pet opens T3 Neo on the most relevant thread (an unseen
   finished one, else a running one, else home). Hovering grows the widget: the pet moves up and a
   list (`.neo-pet-list`, 18 px corners like the composer, `overflow: hidden` so row hovers never
   poke out of the corners; rows 14 px) with a
   pill list appears under it with the running threads (spinning loader icon) and unseen finished
   threads (check icon); clicking an entry opens that thread.
6. **Activity source.** `usePetActivitySync` derives running threads from the thread shells,
   the viewed thread from the route, and typing from `input`/`keydown` events inside
   `[data-chat-composer-form]`. `petActivity.ts` holds the store and the pure helpers `petMoodFor`
   and `petBadgeFor`.
7. **Desktop pet window.** `apps/desktop/src/ipc/methods/pet.ts` opens a transparent, frameless,
   non-focusable, always-on-top window (280×380) that loads `#/pet` (`apps/web/src/routes/pet.tsx`
   renders `PetWidget mode="window"` with a transparent document). IPC channels `pet.openWindow`,
   `pet.closeWindow`, `pet.moveWindow({dx,dy})` (dragging the pet moves the window), and
   `pet.focusMain(target)` (reveals the main window and sends the menu action
   `open-thread:<environmentId>:<threadId>`, handled in `AppSidebarLayout`). Exposed on
   `desktopBridge.pet` (optional in `packages/contracts/src/ipc.ts`). The pet window closes with the
   main window.

## Usage badges

1. **What.** After a turn completes, the assistant message shows a small semitransparent amber
   badge describing what the turn cost: **included** (no billed cost and no limit usage), **X% of
   limit** (the share of the provider's rate-limit window the turn consumed, derived from the
   provider's rate-limit reports before and after the turn), or **Billed** with the USD amount
   when the provider reports a cost or the limit is exceeded (destructive styling). Limit-based
   headlines end with ` · {plan}`: the plan name from the provider's auth label ("Claude Max 20x",
   "ChatGPT Plus"; `usagePlan.ts` strips a trailing "Subscription"), else the provider name. For
   Claude the multiplier comes from `ClaudeProvider`: it reads the account's rate limit tier
   (`organizationRateLimitTier` / `userRateLimitTier`, e.g. `default_claude_max_20x`) from
   `~/.claude.json` (or `$CLAUDE_CONFIG_DIR/.claude.json`) through Effect `FileSystem` and appends
   "5x"/"20x" to the subscription label when it is not already there. A
   tooltip shows the detail (tokens, window, cost).
2. **Live badge.** Right of the runtime mode control in the composer footer sits a pill with the
   tightest plan window from the newest usage report in the thread ("12% · 5h limit"). Hovering
   (or focusing) lifts a semi-transparent amber card centered above it (`ComposerUsageBadge`: the
   shared `Tooltip` primitive, portaled so the composer's overflow never clips it, styled by
   `.neo-usage-card`) listing every reported window with a meter, the last turn's tokens and
   cost, and this calendar month's spending per provider plus the total from `useUsage`. It is
   hidden with the usage badges setting.
3. **Server.** `apps/server/src/orchestration/turnUsage.ts` normalizes provider rate-limit
   snapshots (`normalizeRateLimitSnapshot`: Claude `rate_limit_info` with utilization 0..1, Codex
   `primary`/`secondary` windows with `usedPercent`; `usedPercent` rounded to one decimal; every
   window kept in `windows`, tightest first), `buildTurnUsagePayload` (adds `provider` and
   `windows` to the payload), and `turnUsageActivity`. `ProviderRuntimeIngestion` tracks the latest
   rate limits per provider instance (`account.rate-limits.updated`), snapshots them when a turn
   starts, and appends a `provider.turn.usage` activity (kind constant `TURN_USAGE_ACTIVITY_KIND`)
   when the turn completes, carrying `usage`, `totalCostUsd`, and the before/after limits.
   A turn that started with no baseline (first turn since the server saw the account) adopts the
   first rate-limit report that arrives while it runs as its baseline (keyed by thread:turn in
   `turnRateLimitBaselines`), so a one-request turn reads "<1%" rather than an unknown share. If
   there is still no baseline at completion, `windowDeltaPercent` is the post-turn `usedPercent`
   when that is still under 1 % (the turn's share is bounded by it), else null. The client never leads with the cost while a plan window was reported: an unknown share
   reads **Included · {plan}** and the cost estimate moves into the detail.
   Codex specifics: `normalizeRateLimitSnapshot` unwraps `rateLimits` up to twice, because the
   Codex adapter forwards the whole `account/rateLimits/updated` params (themselves
   `{ rateLimits: snapshot }`) under a `rateLimits` key; and since Codex puts no usage on
   `turn.completed`, the ingestion sums the per-call `last*` counts of every
   `thread.token-usage.updated` event during the turn (`addTurnTokens`, keyed by thread:turn) and
   uses that sum as `usage` when the completion event carries none.
   This is the only server change; it emits an activity through the existing activity path
   and adds no new contracts, commands, or events.
4. **Client.** `apps/web/src/neo/turnUsage.ts` parses those activities (`parseTurnUsagePayload`,
   `turnUsageByTurnId`, `latestTurnUsage`, `formatTurnUsage(usage, planLabel)`);
   `apps/web/src/neo/UsageBadge.tsx` renders the badge; `ChatView.tsx` builds the map only when
   the setting is on and passes `turnUsageByTurnId` plus `turnUsagePlanLabel` to
   `MessagesTimeline`, which renders the badge on the assistant row of a finished turn, and
   `latestTurnUsage`, `usagePlanLabel`, `showUsageBadge`, `composerExpanded` to `ChatComposer`.
   `session-logic.ts` skips the activity so it never shows as a timeline item.

## Tests that must exist and pass

- `apps/web/src/neo/neoSettings.test.ts`: defaults and broken storage, partial merge, size clamp,
  persistence round trip.
- `apps/web/src/neo/pets/petActivity.test.ts`: `petMoodFor`, `petBadgeFor`, running/unseen
  transitions (a thread that stops running while not viewed becomes unseen; viewing clears it).
- `apps/web/src/neo/turnUsage.test.ts`: payload parsing and label formatting (free, percent,
  billed).
- `apps/server/src/orchestration/turnUsage.test.ts`: Claude and Codex snapshot normalization and
  payload building.

# Feature 5: Processes dialog

## Behavior

A **Processes** icon button (lucide `RouterIcon`) in the chat header opens a dialog listing every
process the agents and terminals of this environment are running right now, grouped by the thread
they work for, with CPU, memory, and running time per row and a way to end one (**Stop** = SIGINT,
**Kill** = SIGKILL after a destructive confirmation). The list refreshes every two seconds while
open. It needs the resource monitor sidecar (`native/resource-monitor`, shipped by the desktop app;
the release workflow builds it with the Rust toolchain), so in a plain web checkout the dialog shows
the server's monitor error instead of an empty list. Documented for users in `docs/user/neo.md`
("Processes").

## Implementation

`apps/web/src/neo/ProcessesDialog.tsx` exports `ProcessesButton`, a
ghost `Button` (`size="icon-sm"`, lucide `RouterIcon`, aria-label "Processes",
`data-neo-processes-button`) mounted first in `ChatHeader`'s actions row
(`[data-chat-header-actions]`, left of the project scripts control), so it folds away with the
other actions when the header is collapsed. It opens a `Dialog` (`max-w-3xl`) that reads upstream's
`serverEnvironment.processDiagnostics` query, refreshes it every 2 s while open, and groups the
entries with `groupProcesses` (`apps/web/src/neo/processGroups.ts`): one section per origin,
labelled "<Provider> · <thread title>" for provider sessions, "Terminal · <thread title>" for
terminals, "T3 server helpers" for unattributed server children; thread groups first, server
last, tree order kept inside a group. Rows show executable name (`processDisplayName`), PID,
CPU %, RSS (`formatBytes`), elapsed, and two actions: **Stop** (SIGINT) and **Kill** (SIGKILL
after `ensureLocalApi().dialogs.confirm`, destructive), both through upstream's
`serverEnvironment.signalProcess`; failures and refused signals toast.
Server side, the attribution is new: `packages/contracts/src/server.ts` adds
`ServerProcessOrigin` (`kind: "provider" | "terminal"`, optional `provider`,
`providerInstanceId`, `threadId`) as the optional `origin` of `ServerProcessDiagnosticsEntry`.
`apps/server/src/diagnostics/ProcessOrigins.ts` is a module registry:
`registerProcessOrigin(pid, origin)` / `unregisterProcessOrigin(pid)`,
`registerCommandTokenOrigin(token, origin)` (a session id that appears on a command line), and
`resolveProcessOrigins(processes)`, which labels each process by its own registration, a
command token, or the nearest labelled ancestor. `ProcessDiagnostics.read` resolves origins over
the full telemetry tree and attaches them. Registrations: `CodexSessionRuntime` (the app-server
child, provider `codex`, thread + instance), `AcpSessionRuntime` (new optional `origin` option;
`CursorAdapter` passes `cursor`, `GrokAdapter` passes `grok`, probes pass none), `ClaudeAdapter`
(the Claude session id as a command token, since the SDK spawns `claude` itself), and
`terminal/Manager.ts` (the PTY pid as `terminal` for the session's thread, unregistered on
exit). Codex and ACP unregister through a finalizer on the runtime scope. Applies under both
looks.

## Tests that must exist and pass

- `apps/web/src/neo/processGroups.test.ts`: grouping by origin with provider and thread labels,
  ordering, the unknown-thread fallback, `processDisplayName`, `formatBytes`.
- `apps/server/src/diagnostics/ProcessOrigins.test.ts`: direct, descendant, command-token, and
  unregistered/cyclic resolution.
- `apps/server/src/diagnostics/ProcessDiagnostics.test.ts` (upstream's file, extended): `origin`
  is absent by default and a registered provider pid labels its descendants.

# Feature 6: carried fixes

Bug fixes the fork carries on top of upstream. Every fix a `neo:fix` issue produces is added here
as a numbered item (symptom, cause, where the fix lives, its test) and gets a regression check in
`verify.sh`, so the next upstream sync rebuilds it instead of losing it with the reset. Drop an
item once upstream ships the same fix. Keep each one minimal and behavior-identical.

1. **JSON-RPC errors are failures, not defects.** `packages/effect-acp/src/protocol.ts`
   `makeAcpPatchedProtocol` runs every incoming exit through `normalizeExitEncoded`: when an agent
   answers a core request with a plain JSON-RPC error object (`{ code, message }`, no Effect cause
   envelope), the serialization layer files it under `Die`; the fix re-files protocol-shaped
   defects as `Fail` so callers receive an `AcpRequestError` they can act on. Test in
   `protocol.test.ts`: "files a plain JSON-RPC error for a core request as a failure, not a
   defect".
2. **Rejected `session/load` starts a new session.** In `AcpSessionRuntime.ts`, when the agent
   answers `session/load` with an `AcpRequestError` (the stored session id is gone or unknown to
   this agent build), log a warning and fall through to `session/new` instead of failing the
   turn; the adapter then persists the fresh id. Transport faults, timeouts, and exits still fail
   as before. Test in `AcpJsonRpcConnection.test.ts`: "starts a new session when the agent rejects
   session/load".
3. **Cursor plan limit as a rate-limit report.** Cursor never reports usage windows; when the plan
   is exhausted it answers a prompt with "Upgrade your plan to continue". `CursorAcpSupport.ts`
   exports `isCursorPlanLimitReply(text)` and `cursorPlanLimitRateLimits` (`{ windows: [{ label:
"Plan Limit", usedPercent: 100 }], status: "rejected" }`); `CursorAdapter` emits an
   `account.rate-limits.updated` event with that payload when a text reply matches (before the turn
   completes, so the usage badge reads "Limit Reached"), remembers it on the session context
   (`planLimitReached`), and withdraws it with `rateLimits: null` on the next real reply. Test in
   `CursorAdapter.test.ts`: "reports a full plan window when Cursor answers with its upgrade
   notice".

# Constraints

- Follow `AGENTS.md`. Keep changes minimal and inside the surfaces named above.
- Do not change `apps/mobile`. Server, contract, and adapter changes are limited to: the usage
  activity, the optional `pet` bridge, and the Claude rate-limit-tier label (feature 4); the
  process origin contract, registry, and registrations (feature 5); and the carried fixes listed
  in feature 6.
- Never reference the website that inspired the Neo look, in code, comments, docs, or commits.
  The design language above is the whole description.
- Do not commit; the workflow commits and pushes.
- Do not run repo-wide checks yourself; run `bash .github/upstream-sync/verify.sh`.
- If upstream moved or renamed something this spec references, adapt to upstream's new structure
  and keep the behavior above. Prefer adapting the previous implementation from `feature.patch`
  over rewriting from scratch, unless the run was started in `redo` mode.
