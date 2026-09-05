# Fork automation: upstream sync and issue-driven releases

> For maintainers. Using T3 Neo? See [docs/user](../user/).

This repository is T3 Neo, a fork that stays equal to every stable upstream T3 Code release plus
the T3 Neo feature set: queued messages ([composer.md](../user/composer.md#queued-messages)),
the Neo look ([appearance-looks.md](../user/appearance-looks.md)), T3 Neo branding and in-place
updates, pets, usage badges, the movable branch manager, and the Neo settings tab
([neo.md](../user/neo.md)). They are reapplied, verified, reviewed, built, and released by
Claude Code through the workflows under `.github/workflows/` rather than maintained by hand.

- Setup, labels, versioning, and the run sequence: [`.github/upstream-sync/README.md`](../../.github/upstream-sync/README.md)
- The feature specification Claude Code implements: [`.github/upstream-sync/FEATURE.md`](../../.github/upstream-sync/FEATURE.md)

Design notes:

- One line only: `main` is the chosen upstream release plus the features, rewritten on every sync
  (upstream release commit, one commit restoring the automation, one with the features, review
  fixes, one refreshing `feature.patch`). Releases are `vX.Y.Z-neo.<n>` starting at `-neo.0`; fixes
  and features requested through issues land on `main` as patch releases. Nothing is maintained
  backwards. Do not base long-lived work on `main`.
- Tags stay semver (`-neo.<n>` rather than a fourth version number) because electron-updater and
  GitHub release ordering require it; that is what lets installed desktop builds update in place.
- Almost everything lives in `apps/web` (the desktop app wraps the web client) plus a few desktop
  files for the pet window. The server changes are the `provider.turn.usage` activity emitted
  from `ProviderRuntimeIngestion` and the Claude rate-limit tier in the auth label; the only
  contract change is the optional `desktopBridge.pet` API. Mobile is never touched. Keeping the
  footprint this small is what makes automatic reapplication reliable; the spec forbids widening
  it.
- Every code change passes the same gate: implementation until `verify.sh` passes, an independent
  review session, fix rounds, and an approval session that must answer `APPROVED`. Rejected work
  is reported on the issue with the label `neo:needs-human` and never released.
- `feature.patch` is regenerated from the successful result of every run. It is a starting point
  for the next run, never the source of truth; `FEATURE.md` is.
- The build injects `VITE_T3NEO_REPOSITORY=<owner>/<repo>` so in-app repository links, the
  download row, and the desktop updater point at the fork that built them.
