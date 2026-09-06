# T3 Neo

T3 Neo is a fork of T3 Code that follows every stable T3 Code release and adds a few things on
top. Everything below lives under **Settings → Neo** and **Settings → Pets**, right below General,
and works on web and desktop.

## Neo settings

- **Repository.** The slim card above every settings tab shows the T3 Neo version and opens the
  repository.
- **Updates.** On desktop this row updates the installed app in place: **Check for updates**,
  **Download update**, then **Restart to update**, the same way other programs update. In the
  web app it links to the newest T3 Neo build for your platform (macOS Apple silicon or Intel,
  Linux AppImage, Windows installer), or to the release page if no matching file exists. macOS
  builds that are not notarized ask for **Open Anyway** in System Settings → Privacy & Security on
  their first launch; after that they update in place like any other build. Completely unsigned
  macOS builds cannot update themselves; download the new version instead.
- **Nightly builds.** T3 Neo can also ship rebuilds of T3 Code nightlies, with versions like
  `0.0.39-nightly.neo.20260904.1280`. They are pre-releases: normal installs and the download
  link never switch to them. To follow them on desktop, set the update channel to **Nightly**;
  the app then updates from nightly to nightly and is named **T3 Neo (Nightly)**.
- **Default context window** picks whether a new chat starts on the model's biggest or smallest
  context window, when the model offers a choice. New chats default to the smallest.
- **Default fast mode** picks whether a new chat starts with the model's fast mode on (fastest)
  or off (slowest), when the model has one. New chats default to the slowest, highest-quality
  setting. Both apply only to new chats; changing a model's option inside a chat still sticks.
- **Show usage badges** turns the per-turn cost badge on or off.
- **Confirm before discarding a queued message** shows a small Cancel / Discard pop-over on the
  queue's trash button. Off, the trash button deletes the message right away.
- **Queue messages while a turn runs** turns queued messages on or off. With it off, sending while
  an agent works steers the running turn immediately, like T3 Code. See
  [composer.md](composer.md#queued-messages). The queue panel above the composer collapses to a
  single row with the chevron.
- **Keep the composer expanded** lets the message box grow as your text wraps or you add lines,
  up to eight lines, and keeps the tallest size it reached until you send or clear the message,
  even when you delete lines or focus moves elsewhere.
- **Header actions button** (on by default) adds a small double-chevron button at the right end
  of the chat header's actions, next to the terminal toggle. Press it to fold **Add action**,
  **Open**, the branch controls, and **Commit** away; press it again to bring them back.
- **Collapse header actions** folds those actions away from Settings, the same as pressing the
  button. While folded, the header slims to a thin bar and the workspace below it becomes a card
  with rounded top corners. The double-chevron and the panel toggles sit in a small notch at the
  card's top-right corner; press the chevron there to unfold. With the sidebar hidden, the window
  controls and the sidebar button get a matching notch at the top-left corner; the sidebar button
  keeps its place next to the window controls whether the sidebar is open or hidden.
- **Branch manager position** moves the workspace and branch controls from below the message box
  into the header next to **Open**, which gives the composer more room. With **Show the branch
  manager move pill** on, an amber pill next to the workspace control moves it up, and the same
  pill at the bottom of the branch list moves it back down. When the header gets tight, the
  workspace label folds to its icon first; hover it to read the name.

## Processes

The router icon in the top bar, left of **Add action**, opens **Processes**: everything the agents and
terminals of this environment are running right now, grouped by the thread they work for, with
CPU, memory, and running time per process. **Stop** asks a process to end (SIGINT); **Kill** ends
it at once after a confirmation. The list refreshes every two seconds while the dialog is open. It
needs the desktop app, which ships the process monitor; the plain web server has no process list.

Dev servers an agent left running in the background, such as a `deno task dev` on port 3000, no
longer hang off the agent's process once its shell exits. The dialog still finds them by the port
they listen on and lists them under **Dev servers**, grouped by the thread worktree or project
their working directory falls into, with the port next to the name. Stop and Kill work for them
too. This needs `ps` and `lsof`, so it is macOS and Linux only.

## Chevron animations

Under **Settings → Appearance**, **Chevron animations** (on by default) makes the small arrows on
menus, pickers, and popovers point away from the side the menu will open on, and turn to face the
menu while it is open. A picker above the message box opens upward, so its chevron points down
until you open it and then flips up; a menu that opens downward does the reverse. Turn the switch
off to keep every chevron still.

## Pets

A pet keeps you company while agents work. On desktop it lives in its own small window that
floats above other apps, never inside T3 Neo itself. Choose one under **Settings → Pets**:

- **No pet** closes the pet window. Its preview shows a spinning ASCII X.
- **Hoppy (Loop)** is a white rabbit that hops in a smooth loop.
- **Wukong (Reactive)** is an ASCII monkey. He sleeps while you read, watches while you type in
  the composer, and sits hammering while any thread is running.
- **Lunar (No Animation)** is the still moon with its ring glow: no pet, just the status. The
  badge and the activity list stay.

The pet floats above the app. Drag it anywhere; the position is remembered. The **Pet size**
slider changes how big it is, down to a 32 px corner companion, and the preview cards tour every
mood so you can see what each pet does. Wukong's preview shows each of his animations for a few
seconds, and none comes back until all the others have played. Wukong keeps working between queued
messages instead of dozing off, unless the queue is paused, and watches you while an agent waits
for an approval or an answer. Typing counts in every window: the pet window sees you type in the
main window.

**ASCII pet color** sets the glyph color of the X and of Wukong. **System** follows the appearance:
warm amber on a dark canvas, the accent orange on a light one. **Light** and **Dark** pin one of
those colors regardless of appearance. The circle next to the select previews the choice; for
System it shows both colors split on a diagonal. With the Neo look off, the pet and the **Neo**
badges take the theme's action color instead, the dark and light one for each appearance.

The pet doubles as a status light, with the words the Codex pet uses. A bubble above it names one
thread: one that needs an approval or an answer first ("Needs input"), else a running one
("Running"), else one that failed ("Blocked") or finished ("Ready") while you were looking
somewhere else. Click the bubble to open that thread. Two round pills always
sit below the pet: the first shows the number of running threads, a check once finished work is
waiting for you, and 0 when nothing runs and you have seen everything; the second switches the
bubble between showing one run and showing all of them. It always works, and the choice stays put
until you change it, even while nothing is running.

Clicking the pet itself never opens a thread or a new draft; in the desktop pet window it brings
T3 Neo forward, and inside the app it does nothing.

The paw-print button in the sidebar footer opens **Settings → Pets** directly; it is filled in the
accent color while a pet is on.

### Pet window

Picking a pet opens its window; picking another pet swaps it in place, and **No pet** closes the
window. It stays above other apps and never steals keyboard focus, and it is only ever as big as
the pet with its bubble and pills, growing upward when the bubble needs room; the bubble itself is
at most twice as wide as the pet. Drag the pet to move the window.
Clicking it brings T3 Neo forward. The pet window closes with the main window. Pets need the
desktop app; the web app has no window to put them in.

### Codex pets

Below the pet picker, **Codex pets** lists four community galleries. Pick one in the first
select: [codexpet.top](https://codexpet.top), [codex-pet.com](https://codex-pet.com),
[codexpets.org](https://codexpets.org) or [openpets.sh](https://openpets.sh). codexpet.top carries an
award mark: its pets are drawn by hand, without AI blur or outline halos. Search by name,
author or category, or narrow the list with the category select where the gallery has one; the
list loads fresh every time you open the tab, so new pets show up on their own. Hover a card to
see the pet move. The pill in the section header opens the selected gallery's site, the GitHub
button next to it opens the repository the pets come from. The link on each card opens that
pet's files and license. openpets.sh only answers the desktop app.

**Import** downloads the pet and picks it right away. Every import is a copy of its own: it gets a
card in the pet picker with the gallery name, author and site, you can **Rename** or **Delete**
it there, you can import the same pet again, and changes in the gallery never reach the pets you
already have. Imported pets behave exactly like they do in the Codex app: when an agent starts
working, needs your input, fails, or finishes while you look elsewhere, the pet plays that state's
animation three times and then settles into its slow idle breathing until something changes. Drag
the pet and it runs along in that direction; click it and it waves. They ignore typing, as Codex
pets do. Deleting the pet you are using switches to **No pet**.

## Usage badges

After an agent finishes a turn, the reply shows a small amber badge with what that turn cost:

- **X% of Limit** when the provider reports usage windows. The percentage is the share of your
  current window the turn consumed; a window that barely moved reads "<1% of Limit".
- **Billed** with the amount when the provider reports a cost, or when the turn ran past your
  limit.
- **Free**, in green, on a plan that never bills, such as Cursor Free, when the provider reports
  token counts but no windows and no cost.
- **Limit Reached**, in red, when the plan refused the turn: Claude reports the window as rejected,
  and Cursor answers "Upgrade your plan to continue". Cursor reports no usage and no reset times,
  so the pill next to the composer shows **Limit Unknown** and the hover card says so instead of
  guessing.

A turn the provider reported nothing about shows no badge at all.

Limit-based badges end with the plan they count against, such as "· Claude Max 20x" or
"· ChatGPT Plus", or the provider name when the CLI does not report a plan. Hover the badge for
token counts, the limit window, and the raw cost.

The composer has a live usage pill next to the runtime mode: the plan window that is filling up
right now. Hover it for a card with every reported window, the last turn, and this month's
spending per provider. A small pill after each window label counts down to when that window
resets. Badges depend on what each provider CLI reports: Claude Code and Codex report limits and
costs; providers that report nothing show no badge.
