# T3 Neo automation

This fork (T3 Neo) tracks upstream [pingdotgg/t3code](https://github.com/pingdotgg/t3code) and
carries the T3 Neo feature set on top: **queued messages**, the **Neo look**, **T3 Neo branding**
with in-place updates, **pets**, **usage badges**, the movable **branch manager**, the **Neo** and
**Pets** settings tabs, the **Processes** dialog, and the carried fixes. Everything is specified
in `FEATURE.md` (six numbered features, each with the tests that must pass); `verify.sh` checks
every file, hook, and test the spec names. Add a feature by extending both, or by opening a feature
request issue and letting the automation do it.

Nobody edits code by hand here. Claude Code (`claude-fable-5-1`) does all implementation, review,
and approval work, driven by three workflows and a handful of labels.

## Versions

- One line only: `main` is the chosen upstream release plus the T3 Neo feature set. There are no
  per-version branches and nothing is maintained backwards; the automation only moves forward.
- Releases are tagged `vX.Y.Z-neo.<n>`: `-neo.0` is the first build on upstream `vX.Y.Z`,
  `-neo.1`, `-neo.2`, … are patch builds after automated fixes or features. Every release is
  marked "latest".
- The `-neo.<n>` suffix (instead of a fourth number like `v0.0.37.0`) is deliberate: the desktop
  updater and GitHub's release ordering only understand semver, and `0.0.37-neo.1` sorts after
  `0.0.37-neo.0` and before `0.0.38-neo.0`. A four-part tag would break in-place updates.
- Nightlies are separate and on demand: upstream `vX.Y.Z-nightly.<date>.<run>` becomes
  `vX.Y.Z-nightly.neo.<date>.<run>`, a pre-release that is never "latest", built from the
  `nightly` branch without touching `main`. `nightly` stays the first pre-release word because the
  desktop updater reads the update channel from it; only installs on the Nightly channel see them.

## The workflows

### Upstream Sync (`upstream-sync.yml`)

Runs every six hours, on **Run workflow** (pick any stable upstream tag from the dropdown, or
type one), and on `/redo` or `/sync` comments in notification issues.

1. **Resolve** the upstream release. The dropdown lists every stable upstream release (refreshed
   daily); `upstream_tag_custom` accepts any other tag. Picks the next `-neo.<n>`; skips when that
   upstream version is already published unless `force`, `redo`, or a comment asked for it.
2. **Reapply**: reset `main` to the upstream commit, restore everything listed in
   `automation-paths.txt` (this directory, the workflows, the issue templates; upstream's own
   issue templates are dropped), then run `agent.sh reapply`:
   - stage 0 applies `feature.patch` with a 3-way merge (skipped in `redo` mode),
   - stage 1 hands the tree to Claude Code with `FEATURE.md` as the spec until `verify.sh` passes
     (up to three attempts, each fed the previous verification output), committed as
     `feat: reapply T3 Neo features`,
   - stage 2 a fresh Claude Code session reviews the diff and writes `review-<n>.md`,
   - stage 3 another session fixes every "Must fix" item (`fix: address automated review`), up to
     two rounds,
   - stage 4 a final session reads code and reviews and writes `verdict.txt`; anything but
     `APPROVED` fails the run.
3. Regenerate `feature.patch` and force-push `main`.
4. **Build and release** through `neo-build-release.yml`.
5. **Notify**: open an issue that @-mentions the owner (label `neo:released` or
   `neo:needs-human`).

### Neo Nightly (`neo-nightly.yml`)

On **Run workflow** only: pick an upstream nightly from the dropdown (refreshed daily), type one, or
leave `latest` for the newest upstream nightly. Same steps as Upstream Sync (resolve, reset to the
upstream commit, restore the automation, `agent.sh reapply` with `sync` or `redo`, then Build and
Release with `channel: nightly`), with three differences: `main` is never touched and the result is
force-pushed to the `nightly` branch, `feature.patch` is not refreshed (the nightly starts from the
stable implementation but never feeds back into it), and the release is a pre-release that is
never marked latest. Skips when that nightly is already published unless `force`, which replaces
the earlier release and tag. Success shows up in the run summary; a failure opens a
`neo:needs-human` issue.

### Neo Build and Release (`neo-build-release.yml`)

Reusable: `vp check`, typecheck, and tests; desktop builds for macOS arm64 and x64, Linux x64, and
Windows x64 (with `VITE_T3NEO_REPOSITORY` set to this repository so in-app links, downloads, and
the updater point here); a GitHub release with the artifacts, updater manifests, and blockmaps.
`channel: stable` (default) marks the release latest; `channel: nightly` publishes a pre-release
named "T3 Neo Nightly …" that is never latest.

### Neo Issues (`neo-issues.yml`)

Issue-driven work, managed by labels. The templates under `.github/ISSUE_TEMPLATE` set them.

| Label                                                                                        | Meaning                                                                                         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `neo:fix`                                                                                    | Bug report. Claude Code fixes it on `main`, lists it in `FEATURE.md`, checks it in `verify.sh`. |
| `neo:feature`                                                                                | Feature request. Claude Code builds it on `main` and extends `FEATURE.md`.                      |
| `neo:go`                                                                                     | Added by a maintainer to start work on an issue from someone without write access.              |
| `neo:working`, `neo:in-review`, `neo:released`, `neo:needs-human`, `neo:awaiting-maintainer` | State, set by the workflow.                                                                     |

For a fix or feature the workflow checks out `main`, writes the issue (body and
comments) to a file, and runs `agent.sh issue`: implement until `verify.sh` passes (commit
`fix: <subject>` or `feat: <subject>`, conventional and under fifty characters), review, fix
rounds, approval gate. On approval it opens a pull request into `main` with the review attached,
merges it, refreshes `feature.patch`, and publishes `vX.Y.Z-neo.<n+1>`. The issue gets a comment at every step, `neo:released` and is
closed at the end, or `neo:needs-human` with the verdict when the change was rejected. Comment
`/retry` (optionally with more details) to run again.

Issues from `OWNER`, `MEMBER`, or `COLLABORATOR` run immediately. Others wait for a maintainer to
add `neo:go`, unless the repository variable `NEO_AUTO_FROM_ANYONE` is `true`.

### Neo Refresh Upstream Tags (`neo-refresh-tags.yml`)

Daily. Rewrites the `upstream_tag` dropdowns in `upstream-sync.yml` (stable upstream releases)
and `neo-nightly.yml` (upstream nightlies) with `refresh-upstream-tags.sh` and commits
`chore(ci): refresh upstream tag choices`.

## One-time setup in the fork

Secrets (Settings → Secrets and variables → Actions):

- `UPSTREAM_SYNC_TOKEN`: a personal access token that can push branches including files under
  `.github/workflows` (classic: `repo` + `workflow`; fine-grained: Contents, Workflows, and Pull
  requests read/write). `GITHUB_TOKEN` cannot push workflow files, and every sync re-adds them.
- `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token` on a Claude subscription) **or**
  `ANTHROPIC_API_KEY`. One account runs everything.
- Optional signing: the same `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
  `APPLE_API_ISSUER`, `MACOS_PROVISIONING_PROFILE` secrets and `APPLE_TEAM_ID`,
  `CLERK_PASSKEY_RP_DOMAINS` variables upstream uses. Without them builds are unsigned; unsigned
  macOS builds cannot update themselves in place.
- Cheaper macOS option, no Apple Developer account: only `CSC_LINK` and `CSC_KEY_PASSWORD`. Create a
  self-signed **Code Signing** certificate in Keychain Access (Certificate Assistant → Create a
  Certificate, type Code Signing), export it as a `.p12` with a password, and store the file
  base64-encoded as `CSC_LINK` and the password as `CSC_KEY_PASSWORD`. The workflow then passes
  `--self-signed`: builds are signed with that certificate but not notarized. Because every build
  carries the same certificate, Squirrel accepts the in-place updates. The first launch of a fresh
  download needs System Settings → Privacy & Security → **Open Anyway** once; updates the app
  downloads itself do not ask again. Keep using the same certificate, a new one breaks the update
  chain until users reinstall.

Variables (optional):

- `UPSTREAM_SYNC_NOTIFY`: mentions to ping instead of the repository owner, e.g. `@alice @bob`.
- `NEO_AUTO_FROM_ANYONE`: `true` lets issues from anyone start Claude Code runs.
- `T3CODE_RELAY_URL`, `T3CODE_CLERK_PUBLISHABLE_KEY`, `T3CODE_CLERK_JWT_TEMPLATE`,
  `T3CODE_CLERK_CLI_OAUTH_CLIENT_ID`: public T3 Connect client configuration if fork builds should
  keep relay features.

Repository settings:

- Enable Actions, enable the five workflows above, and disable upstream's own **Release**,
  **Deploy Relay**, EAS, AUR, and web preview workflows; they need upstream's secrets.
- Allow the token to force-push `main` (no branch protection, or exempt it).
- Enable GitHub Pages from `main`, folder `/docs`, so `docs/download/index.html` (the README
  download button target) is served.
- Run **Neo Refresh Upstream Tags** once so the dropdowns are populated.

## Files

- `FEATURE.md`: the behavior specs Claude Code implements. Edit this to change or add features.
- `feature.patch`: the last successful implementation, regenerated after every run. A starting
  point, not the source of truth.
- `agent.sh`: the Claude Code pipeline (`reapply` and `issue` modes): implement, review, fix,
  approve.
- `verify.sh`: proves the features exist and work (also useful locally).
- `automation-paths.txt`: what survives the reset to upstream.
- `refresh-upstream-tags.sh`: rewrites the version dropdowns (stable and nightly).

Run `bash .github/upstream-sync/verify.sh` in a checkout to check the features by hand.
