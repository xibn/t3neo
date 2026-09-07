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
  and prepared attachments, then the composer draft is cleared. The draft's finished uploads
  are handed to the queue (`handOffDraftAttachments`): the client forgets the upload state
  _and_ the finished job under the draft's key, so the later draft clearing or a capability
  flap releasing that key cannot delete the server copy; only deleting the queued message
  unsent frees it (`releaseQueuedAttachmentUploads`). Editing a queued message puts every
  attachment back: pasted images from their data URLs, files as persisted-upload references,
  uploaded images by downloading their bytes again (`fetchPendingAttachmentFile` via the asset
  URL) and freeing the server copy; they upload afresh on send.
- `messageQueueStore.ts` `setError` also clears `sendNow`: a failed forced send would
  otherwise be re-dispatched at once and loop with "Sending…" shown forever. The row shows the
  error and **Retry** (which sets `sendNow` again and clears the error).
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
   The desktop app has its own bundle id, `com.xibn.t3neo` (`.dev` in development), in
   `scripts/build-desktop-artifact.ts` and `DesktopEnvironment.ts`: with upstream's id, macOS
   treats a T3 Neo launched next to a running T3 Code as a second instance and shows no Dock tile.
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
   starfield (an inline SVG with small stars and five larger embers that breathe in stepped
   keyframes; `preserveAspectRatio="xMidYMin slice"`). The ring glow behind the brand's moon is
   not part of the SVG: the brand is pinned right and the art scales with the sidebar, so
   `.neo-brand-glow` (a span inside the brand link, `z-index: -1` in the link's stacking
   context, centred 11px in from the link's left edge = the moon's centre) draws the soft amber
   disc (r 28px) and three 1px rings (r 13/19/26 at 12 %) with radial gradients, faded at the
   bottom. The art is twice the header height: the top half is the header, the bottom half is a
   tail of stars whose density drops quickly below the header. The backdrop (`.neo-sidebar-backdrop`) is
   `calc(var(--workspace-topbar-height) * 2)` tall with a `mask-image` that stays solid over
   the header and fades to transparent by 90 %, so the field relaxes into the sidebar over a
   short distance instead of stopping at the header's edge. The brand itself is a moon-star icon in `#f1a629`
   with a stepped ember glow, the T3 wordmark, and "Neo", pinned to the right edge of the header under
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
   repository slug comes from the GitHub Pages URL, with a `repo` query override). Its footer
   links the repository with a GitHub mark, and it carries a T3 Neo favicon (`docs/favicon.svg`).
   `docs/_config.yml` serves it at the site root (`/download/` redirects there) and renders the
   manuals under `/docs/`. The README starts with a T3 Neo section that embeds the button
   linking to that page.
7. **README screenshots.** `assets/neo/screenshots/`: `header-collapsed.jpg` (hero, a chat
   with the header folded), then a two-column HTML table with `chat.jpg` (header unfolded),
   `chat-focus.jpg` (folded, sidebar hidden), `settings-pets.jpg`, `processes.jpg`,
   `usage.jpg`, `settings-neo.jpg`, and `settings-appearance.jpg` in a `<details>`. Retaken
   2026-09-07 headlessly (Playwright, the desktop package's `playwright-core` with the cached
   Chromium, 1440×900 CSS px at 2×, dark, `pet: none`, toasts removed) against the dev server
   with a copy of real data. The README section itself is a short technical bullet list of the
   fork's features, ordered by how much people are likely to want them: message queue, usage
   badges, pets (with the Codex galleries), Neo look, processes, collapsible header, Neo
   settings "and more"; no release or automation prose.
8. **Codex pets.** A second section on the Pets tab, **Codex pets** (`id="codex-pets"`, store
   icon, search id `neo-codex-pets`), browses four community galleries and imports from them.
   - `petGalleries.ts` lists the galleries (`PET_GALLERIES`, ids `codexpet-top`,
     `codex-pet-com`, `codexpets-org`, `openpets-sh`; each has a host, site URL and GitHub
     repository) and the per-gallery parsers into one `GalleryPet` shape (name, names for
     search, author, category, description, sprite version, a `preview` of kind `image`
     (still plus optional hover animation) or `strip` (frames side by side, first cell shown)
     or null (first frame cut from the sheet), the spritesheet URL, a `download` of kind
     `spritesheet` or `zip`, page and source URLs): - **codexpet.top** (`legeling/awesome-codex-pet`): `pets.json` and `spritesheet.webp`
     from `raw.githubusercontent.com`; only the preview images (untracked in git) come from
     the site (`thumbnail.webp`, `webp/idle.webp` on hover). - **codex-pet.com** (`BeiXiao/awesome-codex-pets`): the repository holds one
     `pets/<slug>/thumb.webp` per pet and lists them in `README.md`, which
     `parseCodexPetComReadme` reads (slug, thumbnail, HTML-unescaped name). Sprites only
     exist as zips on the site (`/api/download/<slug>`); `downloadGalleryPet` unpacks
     `spritesheet.webp` with jszip. No author or category. - **codexpets.org** (`eyichan/awesome-codex-pets`): `pets.json` from GitHub with
     `spritesheetUrl` on the site (CORS `*`); no thumbnails, so cards show the sheet's first
     cell (`SheetThumbnail`: a lazily loaded image behind a frame-sized window). `kind` is
     the category, tags join the search names. - **openpets.sh** (`alterhq/openpets`): the site's `/api/pets?page&pageSize=30&q&kind`
     API searches and pages (`mode: "api"`, fixed kinds animal/creature/person/object,
     ~5,700 mirrored pets); `previewUrl` is a strip of every frame at 96×104 (`preview.kind:
"strip"`, the card shows its first cell), the sheet animates on hover.
     The API refuses any foreign `Origin`, so the gallery is `needsDesktop`. - `galleryFetch.ts`: on desktop every gallery request goes through
     `desktopBridge.pet.fetchGallery(url)`; in a browser it is a plain `fetch`.
     `apps/desktop/src/ipc/methods/pet.ts` adds `fetchPetGallery`
     (`desktop:pet-fetch-gallery`): https only, hosts limited to `PET_GALLERY_HOSTS`
     (raw.githubusercontent.com and the four sites), GET via the Effect `HttpClient`
     (no Origin header), returns `{ status, contentType, body: Uint8Array }`; errors are
     `DesktopPetGalleryFetchError` (`invalid-url` | `host-not-allowed` | `request-failed`).
     Tested in `pet.test.ts`. Exposed in `preload.ts` and typed in
     `packages/contracts/src/ipc.ts`. - `filterGalleryPets` matches every query word against names, author, slug, category and
     description and combines with a category filter (catalog galleries);
     `downloadGalleryPet` decodes the image and takes the sheet version from its exact size
     (1536×1872 → v1, 1536×2288 → v2), falling back to the gallery's claim, then v1.
   - `PetGalleryBrowser.tsx`: gallery select (host names), search box (debounced 300 ms for
     api galleries), category select (hidden when the gallery has none), cards in pages of 40
     (catalog) or the site's 30 (api) with a **Show more** button, per-card **Import** and an
     external-link button to the pet's files/license. Lists are fetched fresh each time the
     panel mounts. Loading, error (with **Try again**), "desktop only" and empty states.
   - The section header carries a source pill (info icon + the selected gallery's host,
     links to the site) and a GitHub icon button (links to that gallery's repository), so the
     origin stays traceable even if a domain lapses. The panel owns the selected gallery.
     `PetGallery.award` (only codexpet.top: "High-Quality Designs", for hand-drawn pets without
     AI blur or outline halos) shows a lucide `AwardIcon` after the host in the gallery select's
     list and its closed trigger (`.neo-gallery-award`), and an icon-text pill with that label
     left of the source pill in the section header (`.neo-award-badge`). Both are gold
     (`--neo-award`: `#e6bd45` dark, `#9a7411` light) on the usage pill's translucent card
     (40 % border, 14 % fill, 0.375rem corners).
   - `importedPets.ts`: an import is an independent copy. The spritesheet blob goes to
     IndexedDB (`t3code:neo-pets` / `spritesheets`, keyed by the pet id), the metadata
     `{ id, name, spriteVersion, source: { slug, name, author, gallery? }, importedAt }` to
     localStorage `t3code:neo-imported-pets:v1` (`author` is empty when unknown, `gallery` is
     the host). Ids are `import:<uuid>` (`ImportedPetId`); `PetId` is now
     `BuiltinPetId | ImportedPetId` and `neoSettings.pet` is stored as a plain string validated
     by `isPetId` (unknown ids fall back to `none`). The same gallery pet can be imported any
     number of times; nothing is looked up upstream afterwards. A `storage` listener keeps the
     pet window's list in step. Importing selects the new pet; deleting the selected pet
     switches to **No pet** and removes the blob.
   - `ImportedPetCard.tsx` sits in the pet picker grid after the built-ins: live preview (tours
     idle → typing → working → done), name and "<source> by <author> · <gallery>", plus
     **Rename** (in-place input, Enter/check saves, Escape/X cancels, 40 characters max, empty
     falls back to the source name) and **Delete**, which opens an `AlertDialog` ("Delete
     <name>?", Cancel / destructive Delete) before removing the pet and its sheet.
   - `spriteSheet.ts` + `SpritePet.tsx` render Codex sheets the way the Codex app does
     (researched 2026-09-06 in `openai/codex` `codex-rs/tui/src/pets/{model,ambient}.rs` and
     `alterhq/OpenPetsKit`): 8 columns of 192×208 cells, one row per clip, Codex's own timing
     tables (idle is the slow breathing loop 1680/660/660/840/840/1920 ms, not the preview
     GIF tempo; `running-right`/`running-left` 120…220, `waving` 140…280, `jumping` 140…280,
     `failed` 140…240, `waiting` 150…260, `running` 120…220, `review` 150…280; v2 look rows
     unused). Playback (`SpritePlayback`, pure functions `startSpriteState`,
     `advanceSpritePlayback`, `startSpriteGesture`, `endSpriteGesture`,
     `spriteFrameDurationMs`): a state row plays `SPRITE_STATE_CYCLES` = 3 times, then the
     idle loop takes over until the state or its cause changes (`stateKey`: the thread keys
     behind the mood, so a second running thread replays `running` like a new Codex
     notification). Gestures ride on top and hand back to the interrupted sequence: a drag of
     the window plays `running-right`/`running-left` (direction from the pointer's horizontal
     motion, stride kept when it flips), a click plays one `waving`. The sprite is a
     frame-sized box whose `background-position` moves per frame (`setTimeout` per frame hold,
     paused while hidden, first frame under reduced motion; `image-rendering: pixelated` only
     when drawn larger than a cell; an unknown sheet version sizes the background by the
     image's own aspect). Mood → state: idle/typing → `idle` (Codex pets ignore the composer),
     working → `running`, waiting → `waiting`, failed → `failed`, done → `review`.
   - `PetMood` is `idle | typing | working | waiting | failed | done`. `petActivity.ts` derives
     it from the shells the way Codex reads its session (`petThreadActivity`): **waiting** =
     `hasPendingApprovals || hasPendingUserInput` (Codex "Needs input"), **working** = live or
     queued turn (Codex "Running"), **failed** = a thread that left the running set with
     `latestTurn.state === "error"` or `session.status === "error"` and has not been viewed
     (Codex "Blocked"), **done** = finished unseen (Codex "Ready"). Order: typing, waiting,
     working, failed, done. The bubble list uses those Codex labels ("Needs input", "Running",
     "Blocked", "Ready") with help, spinner, alert and check icons. Wukong: waiting → his
     typing/watching clip, failed/done → sleeping. Hoppy and Lunar do not animate states; they
     show them through the bubble and badge only. `createClipShuffle` is generic over the clip
     type and now only serves the settings preview.
   - Pets in the web app stay unavailable (no window); the galleries that allow cross-origin
     requests still browse and import there.

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
the full telemetry tree and attaches them. Dev servers that detach from the tree (their shell
exits and launchd adopts them) are found instead by the ports they listen on:
`apps/server/src/diagnostics/ListenerProcesses.ts` takes the `PortDiscovery` scan (the preview's
port scanner, now shared with the diagnostics), runs `ps -o pid=,ppid=,etime=,rss=,%cpu=,stat=,
command=` and `lsof -a -d cwd -F pn` for the pids the tree lacks (Unix only), and
`ProcessDiagnostics.read` appends them with `origin.kind: "listener"`, the lowest `port`, and
`cwd` (both new optional fields on `ServerProcessDiagnosticsEntry`); `signal` accepts such a pid
when a fresh scan still lists it with a start stamp within 2 s. The client's `groupProcesses`
takes a `workspaceFor(cwd)` resolver (the dialog builds it from thread worktrees, longest match
first, then project roots) and buckets listeners as "Dev servers · <workspace>" after the thread
groups; rows show `localhost:<port>` and the tooltip the directory. Registrations: `CodexSessionRuntime` (the app-server
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
  is absent by default, a registered provider pid labels its descendants, and a listener the
  port scan reports outside the tree is listed with its port and directory.
- `apps/server/src/diagnostics/ListenerProcesses.test.ts`: `ps` elapsed-time shapes, `ps` rows,
  and `lsof` cwd records.

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
