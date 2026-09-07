# T3 Neo

<p>
  <a href="https://xibn.github.io/t3neo/"><img src="assets/neo/download-button.svg" alt="Download T3 Neo for your OS" width="340" height="56"></a>
</p>

A fork of [T3 Code](https://github.com/pingdotgg/t3code) that follows every stable upstream release and adds:

- **Message queue.** Messages sent while a turn runs wait their turn and start their own afterwards. Send now steers instead. Edit, reorder, discard and retry queued messages; attachments stay uploaded until sent.
- **Usage badges.** Every finished turn shows its share of your plan window or its billed cost. The composer pill shows the tightest limit and opens plan, last turn and month-to-date.
- **Pets.** A companion in its own floating window that mirrors your agents: running, needs input, blocked, ready. Import any pet from the four Codex pet galleries, or pick Wukong the ASCII monkey, Hoppy the rabbit or the still Lunar badge.
- **Neo look.** Warm amber palette, flat bordered surfaces, soft corners, a star sky over sidebar and top bar. On by default; the standard look stays selectable.
- **Processes.** One dialog lists everything your agents and terminals run, including dev servers that outlived their shell, with Stop and Kill.
- **Collapsible header.** One button folds the header actions into a slim bar with a rounded workspace card below. The branch manager can move into the header too.
- **Neo settings.** Toggles for all of the above, in-place desktop updates, default context window and fast mode, chevron animations, ASCII pet color, and more.

## Screenshots

<img src="assets/neo/screenshots/header-collapsed.jpg" alt="A chat in the Neo look: the header folded to a slim starry strip, the workspace a rounded card with the panel toggles in its top-right notch" width="100%">

<table>
  <tr>
    <td width="50%"><img src="assets/neo/screenshots/chat.jpg" alt="The same chat with the header unfolded: breadcrumb, Add action, Open, Initialize Git and the usage pill in the composer" width="100%"></td>
    <td width="50%"><img src="assets/neo/screenshots/chat-focus.jpg" alt="Header folded and sidebar hidden: only the card remains, with a notch on each top corner" width="100%"></td>
  </tr>
  <tr>
    <td><img src="assets/neo/screenshots/settings-pets.jpg" alt="Settings → Pets with the four built-in pet cards and the Codex pets gallery below" width="100%"></td>
    <td><img src="assets/neo/screenshots/processes.jpg" alt="The Processes dialog listing dev servers and helper processes with Stop and Kill" width="100%"></td>
  </tr>
  <tr>
    <td><img src="assets/neo/screenshots/usage.jpg" alt="The Usage page: cost per provider, the daily cost chart and the model breakdown" width="100%"></td>
    <td><img src="assets/neo/screenshots/settings-neo.jpg" alt="Settings → Neo with updates, usage badges, the message queue and new chat defaults" width="100%"></td>
  </tr>
</table>

<details>
<summary>Appearance settings</summary>
<img src="assets/neo/screenshots/settings-appearance.jpg" alt="Settings → Appearance with the color scheme tiles, the Look select and the Neo-only switches" width="100%">
</details>

---

# T3 Code

T3 Code is an "agent harness control surface". It enables control of the agents on your machine with a best-in-class mobile app ([iOS](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824), [Android](https://play.google.com/store/apps/details?id=com.t3tools.t3code)), [web app](https://app.t3.codes) and [Electron-based desktop app](https://t3.codes).

Works with your subscriptions on Claude Code, Codex, Cursor, Grok Build, and OpenCode. If they're set up on your computer, T3 Code can control them.

## "Wait, what are you selling me?"

Nothing. We built T3 Code because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar.

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork and build the editor that you want.

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, Cursor, Grok Build and OpenCode. Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `agent login`
> - Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Try it out (install-free)

The easiest way to test T3 Code is to run the server in your terminal (requires Node.js 22.16+, 23.11+, or 24.10+):

```bash
npx t3@latest
```

This will launch T3 Code's backend on your machine as well as the local web app to control your agents.

Tip: Use `npx t3@latest --help` for the full CLI reference.

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

Stable:

```bash
yay -S t3code-bin
```

Nightly:

```bash
yay -S t3code-nightly-bin
```

The AUR packaging is maintained in this repository under [`packaging/aur`](./packaging/aur).

## Some notes

We are very very early in this project. Expect bugs.

We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be.

## Documentation

Full docs live in [docs/](./docs). There's no docs site yet.

- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Customize a project icon](./docs/user/project-settings.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- Multiple accounts: [Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- Linux: [run T3 Code as a background service](./docs/user/background-service.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).

## If you REALLY want to contribute still.... read this first

### Install `vp`

T3 Code uses Vite+ so you'll need to install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before reporting a bug or opening a PR.

Have a feature request? Start an [Ideas discussion](https://github.com/pingdotgg/t3code/discussions/categories/ideas).

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
