# Glossary

Terms whose meaning matters across T3 Code. Architecture and lifecycle constraints belong in the
[overview](./overview.md), not in these definitions.

## Workspace and conversation

| Term           | Meaning                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Environment    | One running server and the machine, credentials, workspace access, and state it owns.             |
| Client         | A web, desktop, or mobile UI connected to an environment. The desktop app can also host a server. |
| Project        | An environment-local workspace record rooted at a directory.                                      |
| Workspace root | The project's base filesystem directory on the environment.                                       |
| Worktree       | A separate Git checkout a thread can use instead of the project's main checkout.                  |
| Thread         | The durable conversation and work history for a project. It survives provider process exits.      |
| Turn           | One user-to-agent work cycle. Provider work can finish before checkpoint and diff work settles.   |
| Activity       | A non-message timeline item, such as a tool action, approval, or failure.                         |
| T3 home        | The base data directory. Runtime state normally lives under its `userdata` directory.             |

## Orchestration

| Term                    | Meaning                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Command                 | A request to change domain state. Accepting it does not mean its side effects have finished. |
| Event                   | A persisted fact produced by a command.                                                      |
| Decider                 | The pure logic that turns a command and current state into events.                           |
| Projection / read model | A view of current state derived from persisted events.                                       |
| Projector               | The logic that applies events to a read model.                                               |
| Reactor                 | A worker that performs follow-up work in response to recorded intent or runtime signals.     |
| Command receipt         | A durable record of a command's result, used to make retries idempotent.                     |
| Runtime receipt         | A test-only signal that an asynchronous milestone completed.                                 |
| Quiesced                | The relevant follow-up workers have finished, beyond the provider turn merely ending.        |

## Providers and checkpoints

| Term                | Meaning                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Provider            | The agent runtime T3 Code controls, such as Codex or Claude Code.                                            |
| Driver              | The integration for a provider kind.                                                                         |
| Provider instance   | One configured provider, with its own settings and lifecycle. Multiple instances can use the same driver.    |
| Adapter             | The boundary translating a provider's native protocol into T3 Code operations and events.                    |
| Session             | The provider runtime attached to a thread. A session can be stopped and resumed without deleting the thread. |
| Runtime mode        | The thread's permission policy. See [permission modes](../user/permission-modes.md).                         |
| Interaction mode    | How the agent approaches the task, such as planning. Separate from permission policy.                        |
| Checkpoint          | A saved workspace state used for diffs and restore, stored as a hidden Git ref.                              |
| Checkpoint baseline | The workspace state captured before the work being compared.                                                 |
| Turn diff           | The workspace changes attributed to one turn.                                                                |

## T3 Neo

Terms the fork adds. They live on the web and desktop clients only, except the usage activity.

| Term           | Meaning                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steer          | A user message sent while a turn is running. The server treats it as `thread.turn.start` for the same thread; the adapter injects it into the running turn instead of starting a new one. Web and desktop only steer on an explicit **Send now**; by default they queue. Mobile always steers.                                                                         |
| Queued message | A user message held on the web or desktop client until its thread stops being busy, then sent as a fresh turn. The queue lives in `apps/web/src/messageQueueStore.ts` and drains from `useMessageQueueDrain`. Busy means a running or starting session, or a sent user message no turn has adopted yet (`hasQueuedTurnStart`). The server has no queue concept.        |
| Look           | A whole-interface restyle chosen in Settings → Appearance → Look (**Neo**, the default, or **Default (Themes)**), stored per client under `t3code:appearance-look`. Unlike a theme, a look owns typography, shapes, and surfaces; `apps/web/src/looks/neo.css` restyles the app under `html[data-look="neo"]`. See [appearance-looks.md](../user/appearance-looks.md). |
| Neo settings   | The T3 Neo settings tab (`/settings/neo`, `NeoSettingsPanel.tsx`) and its per-client store `apps/web/src/neo/neoSettings.ts` (`t3code:neo-settings:v1`): usage badges, message queueing, pet choice, and more. No server or contract state. See [neo.md](../user/neo.md).                                                                                              |
| Pet            | The optional companion that floats over the client (`apps/web/src/neo/pets/PetWidget.tsx`), whose mood follows composer typing and running threads via `usePetActivitySync`. On desktop it detaches into a transparent always-on-top window (`apps/desktop/src/ipc/methods/pet.ts`, route `/pet`).                                                                     |
| Usage badge    | The per-turn cost label under an assistant reply (`apps/web/src/neo/UsageBadge.tsx`): included, a share of the provider's rate-limit window, or billed. Sourced from the `provider.turn.usage` activity `ProviderRuntimeIngestion` emits on `turn.completed` using `apps/server/src/orchestration/turnUsage.ts`.                                                       |
