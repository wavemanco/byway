# byway

The research program and product built on the **Off-Center protocol**: eight composable blocks, a small grammar and a set of configurations that generalize Anshu Chimala's "How to turn your AI into a world-class designer" (Lenny's Newsletter, Sep 1 2026) beyond design.

**The product** is a local-first web app. You describe what you are working on in your own words; byway recommends one of the eight configurations (or composes one from the blocks), shows its steps and who does each, and runs it with you: the AI does the AI steps, you do the human ones (pick, react, trim, compare, write) inside the app, and you take the deliverable away (a page, a memo, a story, options, a storyboard, a diff). Every recipe is labelled honestly: the configurations are **untested** until the studies report, and a composed recipe says it is composed and not tested. byway makes no claim that a recipe works better than any other way of working.

**The research track** builds the harness and studies that will test the configurations ([ADR-0043](docs/adr/0043-research-credibility-without-compromise.md): research credibility comes first). Product data never feeds a study.

## Quick start

Requires Node 24+ and pnpm 11+; pnpm switches itself to the version pinned in `package.json` (`packageManager`), downloading it once. Windows and Linux; macOS later (CI tests the first two, with Node 24.13.1 and pnpm 11.28.6: see [CI](#ci)).

```bash
pnpm install
pnpm demo        # byway with sample outputs: no keys, no AI calls, nothing charged
```

Open http://127.0.0.1:3000. Ctrl+C stops everything.

To use real models:

1. Make API keys for byway alone, so you can revoke them without touching anything else ([ADR-0009](docs/adr/0009-api-key-fencing-constraints.md)).
2. Before the first live run, set a spending limit, or the smallest prepaid balance, in each provider's console where it offers one. That caps what a leaked or misused key can cost, whatever byway's own budgets do (the [playbook](docs/playbook.md)'s "Protect the product's provider keys").
3. Put the keys in `.env.agents` at the repo root (it is gitignored; **never commit keys**), then run:

```bash
pnpm start
```

Both build the web app first, then serve it.

```ini
# .env.agents — any subset; Settings shows which are configured, never the keys themselves
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
FAL_KEY=...          # video clips for Ad Video Chain
```

Keys are read from the process environment (a key exported in your shell wins over the file). They never enter the database, the ledger, artifacts, logs, prompts or the browser, and nothing byway writes under the repo holds them: the web build gets no keys, and Next.js's build caches, which would keep a copy of the environment, are off (byway removes any an earlier version left in `apps/web/.next`). Every run has a budget, and the workspace has one too. A run asks before starting a call whose estimated cost would take it over its budget, and byway does not start a call whose estimated cost would take the workspace past its budget. Estimates can be low, so a call can cost more than its estimate, and spending can end over a budget. Calls under way count against both budgets at their estimate; a call that may have been billed without byway learning its cost (the connection dropped after the request went out, or byway stopped mid-call) counts against the workspace budget only, until you clear it in Settings ([ADR-0095](docs/adr/0095-paid-calls-have-a-durable-spend-book.md)). When byway is stopped, that holds from the moment it stops, for a run's calls and for a call made while recommending or composing alike ([ADR-0099](docs/adr/0099-paid-operations-keyed-to-their-caller.md)). If byway crashed or was killed instead, all its calls first count as under way for up to a minute, a run's against its budget too.

The model a profile names is the only one that answers: byway asks no provider for a fallback model (Anthropic's server-side fallback is never requested, and OpenRouter is pinned to one host with its fallbacks off). When a model declines a request (its safety system or the model says no), byway asks the same model once more, as a separate call that counts against the budgets like any other. If it declines again, or that second call fails, or it cannot be made (a budget has no room for it, or paid calls are paused), the call ends there. A step then stops with a message that says what happened, what was billed (or may have been), and what to do: rephrase the request, or choose another model profile in Settings, and, when a budget had no room, start again with a larger budget or raise the workspace budget. An image step instead goes on without that image, and its note says what happened and what was billed (or may have been). One exception: when either call was billed and byway could not keep it (its image, its request and response, or its cost could not be stored or recorded), or the retry's answer held one of your keys (byway never uses such an answer), byway asks nothing more, the message says so instead of that advice, and the run stops, at an image step too, as it does for any billed call byway cannot keep. A step that runs again (after a restart, or after you raise its budget) does not buy the declined call again, unless byway was killed in the moment between a call being billed and its result being kept. The run's events and the spend ledger record both calls, the second as a retry of the first ([ADR-0102](docs/adr/0102-one-refusal-rule-for-every-provider.md)).

## Scripts

| Command | What it does |
|---|---|
| `pnpm start` | **The way to use byway.** Opens the data directory, starts a local Temporal server and the runner worker in one process, builds the web app (`next build`) and serves it (`next start`) on 127.0.0.1:3000, with real models for the providers that have keys (demo mode can still be switched on in Settings) |
| `pnpm demo` | The same with the mock provider forced on: sample outputs, no AI calls, nothing charged |
| `pnpm dev` | Contributor mode, with hot reload: `next dev` runs inside byway's own server on 127.0.0.1:3000, which checks every request and WebSocket first and is the only port the web app listens on (see Architecture). `pnpm dev -- --demo` forces the mock |
| `pnpm e2e` | The Playwright end-to-end suite: starts `pnpm demo` on a temp data directory and free ports, with the web app built into its own folder (`apps/web/.next-e2e`) so a byway you are running is not rebuilt under you; runs C1, C3, C4, C5 and C6a from a typed problem to the Result screen, then stops it and cleans up |
| `pnpm verify` | The checks to run before a merge: the typecheck, the unit tests, then the end-to-end suite, stopping at the first failure. CI also runs it on Windows and Linux for every push to main ([CI](#ci)) |
| `pnpm vitest run` (or `pnpm test`) | Unit, integration, conformance and guard tests for every package and the app |
| `pnpm -s typecheck` | TypeScript across the packages, the scripts and the app |
| `pnpm --filter ./apps/web run build` | Production build of the web app |
| `pnpm byway validate recipes/c1h.json` | Check one recipe against the grammar (exit 0 ok, 1 violations, 2 unreadable) |
| `pnpm recipes:emit` | Regenerate `recipes/*.json` after changing the catalog |
| `pnpm prompts:slots` | Regenerate the table of what each prompt template shows (`packages/recipe/src/template-slots.ts`, ADR-0097) after changing a template's slots |

`pnpm start`, `pnpm demo` and `pnpm dev` take `PORT` (web, default 3000), `BYWAY_TEMPORAL_PORT` (default 7233) and `BYWAY_DATA_DIR`. If the run engine stops while byway is running, byway says so and stops; start it again. The first start downloads the Temporal dev server once; later starts reuse it. Web-page recipes render pages with Playwright's Chromium (`pnpm --filter ./apps/web exec playwright install chromium` if it is missing; on Linux, `pnpm --filter ./apps/web exec playwright install --with-deps chromium`, which also installs the system libraries Chromium needs). On Ubuntu 24.04 and later, Chromium can draw inside its OS sandbox only once an AppArmor profile allows it: `sh scripts/linux/allow-chromium-sandbox.sh` adds one; read what else it allows first ([The OS sandbox](#the-os-sandbox)).

## Architecture

```
apps/web            Next.js 16 product app: screens and route handlers. A Temporal client only. Binds 127.0.0.1.
packages/contracts  Shared interfaces between the packages and the app (contracts-first, ADR-0068).
packages/protocol   Ports, blocks, glue, rules (with classes), exceptions and media: the machine-readable protocol.
packages/recipe     Recipe format (byway.recipe/1), hashing, tree walking and derivations.
packages/validator  Port-scope typing and rule checks, reported by rule ID.
packages/canonical  RFC 8785 canonical JSON and SHA-256 content hashes.
packages/catalog    The configurations C1–C7 and C6a, the Study 1 arms, their presentations and the chooser.
packages/gateway    Every model, image and video call: providers, profiles, prices, spend caps, the hash-chained ledger, the demo mock.
packages/store      SQLite records (node:sqlite) and content-addressed artifact files.
packages/prompts    Versioned prompt templates for every prompt id, and a strict renderer.
packages/runner     The recipe interpreter as a Temporal workflow, its activities, the worker and the dev engine.
packages/advisor    Recommender (chooser and intake), composer, evidence labels and cost estimates.
packages/cli        `byway validate` and `byway hash` (research tooling).
```

Dependencies point down the stack: the app uses the advisor, runner, store, gateway, prompts and catalog; the runner and the advisor use the gateway, catalog, recipe and validator (and prompts); nothing in `packages/` imports `apps/`, and product code never imports research evaluation instruments. Guard tests enforce this (`apps/web/test/guard-boundaries.test.ts`), along with the rule that no product text claims efficacy (`guard-claims.test.ts`).

**Processes.** `pnpm start`, `pnpm demo` and `pnpm dev` run two Node processes:

1. `scripts/serve.ts`: opens the data directory, the store, the gateway and the prompt templates, and starts the run engine — a local Temporal server persisted in the data directory and the runner worker, which executes runs (model calls through the gateway, page renders in Playwright, human checkpoints). It watches the engine and stops byway, saying why, if the engine stops.
2. The web app on 127.0.0.1: `next start` after a `next build` (`pnpm start`, `pnpm demo`), or, for `pnpm dev`, `scripts/dev-web.ts`: `next dev` created in process inside byway's guarded server. It reads and writes the same SQLite database (WAL, busy timeout) and ledger (cross-process lock), and starts and answers runs through the engine's Temporal client.

**The local server's guard.** byway binds 127.0.0.1, and every request passes a guard first: only loopback Host headers (no DNS rebinding) and no cross-site writes. Under `next start` the app's `proxy.ts` is that guard. `next dev` answers its own internal endpoints (open a file in your editor, attach a debugger, hot reload) before `proxy.ts` runs, so `pnpm dev` never runs `next dev` as its own server: it creates the Next app in process (`next({ dev: true })`) inside a Node http server on 127.0.0.1 that applies the same guard to every request and WebSocket upgrade before Next sees them, refuses Next's internal endpoints (`/__nextjs_*`, `/_next/*`) to any other site, and is the only port the web process listens on (`apps/web/src/server/dev-server.ts`). Never run `next dev` on its own.

## Data

Product data lives in `BYWAY_DATA_DIR`, by default `%LOCALAPPDATA%\byway` on Windows and `~/.byway` elsewhere. byway refuses a folder inside OneDrive or inside a git working tree.

| File | Contents |
|---|---|
| `byway.sqlite` | Workspaces, intakes, runs, run events, checkpoints, preferences, the page renderer's settings (its OS sandbox switch and what the last start-up check found, one for the data directory; [ADR-0105](docs/adr/0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md)), and the spend book: every paid call from admission to settlement, which the budgets are checked against ([ADR-0095](docs/adr/0095-paid-calls-have-a-durable-spend-book.md)), with each step's calls keyed so that a step the engine runs again waits for, or takes over, its earlier attempt's call instead of buying it twice ([ADR-0099](docs/adr/0099-paid-operations-keyed-to-their-caller.md)) |
| `byway.sqlite-wal`, `byway.sqlite-shm` | SQLite's write-ahead log and its index, present while byway runs (and after a crash). Recent commits sit in the `-wal` file until SQLite folds them into `byway.sqlite`, so together they are one database |
| `artifacts/sha256/…` | Every artifact (pages, documents, renders, images, clips), content-addressed |
| `ledger.jsonl` | The audit record of the spend book: one hash-chained entry per model, image or video call, with purpose, model, usage and cost (bodies by hash) |
| `ledger.jsonl.head` | The ledger's last entry, so a cut-off ledger is detectable |
| `ledger.jsonl.damaged-<time>-<pid>` | Only after a crash cut an append short: the torn last line, set aside by the next call so the ledger keeps working ([ADR-0091](docs/adr/0091-provider-edge-billing-fixes.md)). Kept for inspection; byway never reads it |
| `exposure.jsonl` | The exposure register (CR12): the first time each model outside the Anthropic family judged work in a given role, per workspace |
| `temporal.sqlite` | The local Temporal server's state, so runs survive a restart (with any `temporal.sqlite-*` files beside it) |
| `bin/` | byway's own copy of the Temporal CLI, downloaded again when missing |

## Back up and restore

The backup unit is the whole data directory, copied while byway is stopped ([ADR-0094](docs/adr/0094-backup-unit-is-the-data-directory.md)). A copy of `byway.sqlite` alone is not a backup: while byway runs, recent commits sit in `byway.sqlite-wal`, and the main file can lack them entirely.

**Back up**

1. Stop byway (Ctrl+C) and wait until it has exited.
2. Check that the run engine has stopped too. A Temporal server left over from a byway that did not stop cleanly can still be writing `temporal.sqlite`. Nothing may listen on the engine's port (`BYWAY_TEMPORAL_PORT`, default 7233; put yours in the commands below), and no `temporal-sdk-typescript-*` process may be running:
   - Windows (PowerShell): `Get-NetTCPConnection -LocalPort 7233 -State Listen -ErrorAction SilentlyContinue` and `Get-Process temporal-sdk-typescript-* -ErrorAction SilentlyContinue` print nothing.
   - Linux: `lsof -nP -iTCP:7233 -sTCP:LISTEN` and `pgrep -fl temporal-sdk-typescript` print nothing.
3. Copy the whole data directory, every file and folder in it. `bin/` may be left out; byway downloads the Temporal CLI again when it is missing.

**Restore**

1. Stop byway and check that the engine has stopped, as above.
2. Move the current data directory aside (or delete it), then copy the whole backup into its place. Do not copy a backup over a live directory or merge the two.
3. Start byway.

A backup holds what was spent up to the moment it was taken. After restoring an older one, calls made since are in neither the spend book nor the ledger, so the budgets count from the backup's totals; your providers' own dashboards show what was spent since.

**Mixing files from different backups is not supported.** Each mix fails differently. byway reports some of them when it starts (below) and does not detect the others:

- An older or missing `ledger.jsonl` (or `ledger.jsonl.head`): the audit record of calls made after the backup is gone. The budgets still count those calls, because the spend book in `byway.sqlite` is their authority ([ADR-0095](docs/adr/0095-paid-calls-have-a-durable-spend-book.md)). At start byway names the calls the file lacks, by run.
- A `byway.sqlite` older than `temporal.sqlite`: runs the engine has and the store does not are stopped at the next start, before they run another step, and byway says how many. Steps they ran before the restore, and what those cost, are not undone.
- A `temporal.sqlite` older than `byway.sqlite`, or missing: runs the store shows as going that the engine does not have end at the next start, with a plain message.
- An engine ahead of the store on the same run: the run waits on a question the store does not have, and nothing reports it.
- Missing files under `artifacts/`: named at start, with the runs that use them. A missing page, document or image cannot be shown.
- An older `exposure.jsonl`: the register forgets which outside model families judged work after the backup, so the research side cannot rely on it for that period (CR12).

**At start** byway checks the data directory before its engine starts and prints a `checked` line ([ADR-0096](docs/adr/0096-partial-restores-reported-at-start.md)): whether SQLite finds the database file sound, whether every recorded artifact file is there at its recorded size, whether the spend ledger's hash chain and head agree, which calls the spend book holds as written to `ledger.jsonl` that the file lacks, which runs have a recorded cost the spend book lacks (only a ledger lost before byway first read it into the book can leave one), and whether lines of the ledger the spend book could not read are waiting for you to acknowledge them in Settings (paid calls wait until you do); differences under a cent per run are not reported. Settled calls the spend book has not written to `ledger.jsonl` yet, and a torn ledger tail set aside after a crash, are named as notes. When nothing is found, the `checked` line says the ledger's chain is intact and holds every call the spend book records as written to it, at the same cost; calls still under way, or that may have been billed, are never in the ledger. The check changes no run record, ledger line or artifact file (the spend book reads in ledger lines it has not seen, as the first model call would), and byway starts either way.

## Renderer

byway draws pages with Playwright's Chromium, inside the run engine: the pages a model writes (scripts included), web-page examples given as HTML, and the cards a reviewing model sees when the examples and the work take different forms. Cards show images people upload and images providers return. All of this is treated as untrusted ([ADR-0084](docs/adr/0084-renderer-launch-without-secrets.md)):

- Chromium is started in one place (`chromiumLaunchOptions()` in `packages/runner/src/pages.ts`), the same way every time; nothing can add a flag to it. The only thing that varies is the OS sandbox setting below.
- Its environment holds no provider key, nothing that looks secret and no other name from `.env.agents`. One exception: on Windows, when byway is started from a current directory whose drive letter is lowercase (`c:\…`), the engine loads the gateway twice and Chromium does get the file's other names; provider keys and names that look secret are still left out ([ADR-0100](docs/adr/0100-corrections-found-by-the-final-re-check.md); backlog).
- Pages may load only Google Fonts, jsDelivr, unpkg, cdnjs and byway's own artifacts, and a redirect is followed only to another of them: the engine fetches those files itself, one hop at a time, and hands Chromium the result ([ADR-0096](docs/adr/0096-partial-restores-reported-at-start.md)), reading at most 20 MiB of any one file ([ADR-0099](docs/adr/0099-paid-operations-keyed-to-their-caller.md)). WebSockets and direct WebRTC are blocked, and a page that never settles is stopped.
- At start-up byway draws a test page of its own, with a script, and prints a `renderer` line saying whether Chromium is ready, whether its OS sandbox is on and, when it is off, whether the sandbox could start now. Under it, it names Playwright's browsers folder, which byway takes Chromium from (`PLAYWRIGHT_BROWSERS_PATH` moves it, and on Linux `XDG_CACHE_HOME`). Before a web-page run spends anything, and before a run whose examples are shown to a reviewer as cards (three or more, an image among them) makes its first AI call, byway draws that test page again, unless the renderer's Chromium has already drawn a page; a run whose renderer cannot draw it is refused. Any other step that needs a page or a card fails with a plain message. If Chromium is missing: `pnpm --filter ./apps/web exec playwright install chromium` (on Linux, `pnpm --filter ./apps/web exec playwright install --with-deps chromium`).

### The OS sandbox

Chromium draws inside its own OS sandbox, as your web browser does ([ADR-0105](docs/adr/0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md)). A page or image that takes advantage of a bug in Chromium then needs a second bug to get out of the sandbox; on Windows the page renderer runs at Untrusted integrity. On Windows, where it was measured, the sandbox changed nothing else: the same pages, as fast.

- **The switch is in Settings**, under Page renderer's OS sandbox. Turning it off asks first and says what it risks: a malicious page or image, together with a bug in Chromium, could run as you on this computer, next to your API keys (`.env.agents`) and your spending records. A change applies from the next page byway draws; pages being drawn finish as they started.
- **While it is off**, every screen shows a banner, each step whose pages were drawn without it says so in the run's notes, and the start-up line says so. At each start byway also tries the sandbox on a test page of its own, and when it could start, the start-up line says so and Settings offers to turn it back on. byway never switches the sandbox off, or on, by itself.
- **When it cannot start**, the start-up line and Settings say why on this computer and the fix, a banner on every screen points to Settings, and the runs above are refused before they spend anything, with the same words. When Chromium stops without saying why, as it does on Windows, byway's start-up check draws its own test page once without the sandbox to tell whether the sandbox is the cause (only that page, and the setting stays as it is); until then, a refused run names the sandbox as one possible cause:
  - **Windows.** The sandbox is Chromium's normal mode there and needs no admin rights. If security software or a company policy blocks it, allow Playwright's Chromium in that software or ask whoever manages the computer. The message names the file byway runs: Playwright's headless shell (`chrome-headless-shell.exe`, in Playwright's browsers folder), or the folder itself if that file is not there. The file's path changes when Playwright is updated.
  - **Linux, Ubuntu 24.04 and later**, and other systems where AppArmor restricts unprivileged user namespaces. Chromium's sandbox needs those namespaces, and Ubuntu gives them only to programs an AppArmor profile allows (23.10 brought the restriction in without turning it on; 24.04 turned it on). byway's script adds such a profile. Run it once, as yourself, in the byway folder; it asks for your password for `sudo`:

    ```bash
    sh scripts/linux/allow-chromium-sandbox.sh
    ```

    It adds one AppArmor profile, `playwright-chromium`, attached to Playwright's Chromium (the headless shell byway draws with, and full Chromium, in the folder layout Playwright 1.63 uses) in Playwright's own browsers folder, `~/.cache/ms-playwright` (`$XDG_CACHE_HOME/ms-playwright` when that is set; if that folder is reached through a symbolic link, the profile names the folder it points to, where Chromium really runs from). The profile lets those programs create user namespaces and confines them in no other way, as Ubuntu's own profile for Google Chrome does. A Playwright upgrade that keeps that layout needs nothing more; CI's Linux tests, which run with the sandbox on, show when one does not. It covers that folder only, so it stops if `PLAYWRIGHT_BROWSERS_PATH` is set; the start-up line names the folder byway takes Chromium from.

    What else it allows: any program running as you can then create user namespaces through the profile, which is what the restriction exists to stop. It can start one of those Chromium programs with a library of its own (`LD_PRELOAD`); on Ubuntu 24.04, where `kernel.apparmor_restrict_unprivileged_unconfined` is 0 by default, it can enter the profile by name with `aa-exec`; and it can put a program of its own in that folder, which is yours to write. Ubuntu's own profile for Google Chrome can be used in the first two ways too (with `aa-exec`, whether or not Chrome is installed). The alternative is to add no profile and switch byway's sandbox off in Settings, which has its own risk (above): a malicious page or image, together with a bug in Chromium, could then run as you. Without byway's profile the restriction is as Ubuntu set it, and on Ubuntu 24.04 that is not whole either: Ubuntu loads its own profiles of this kind, Google Chrome's among them, whether or not those programs are installed, and while `kernel.apparmor_restrict_unprivileged_unconfined` is 0 any program running as you can enter one with `aa-exec`. Choose for each machine. The script ends by saying how to remove the profile.

    These steps have run on CI's Ubuntu 24.04 machine, which runs this same script before every test run ([CI](#ci)), and not yet on a desktop install (backlog, "What D2 left (ADR-0105)").
  - **Linux, as root.** Chromium does not start its sandbox for root. Run byway as an ordinary user.
  - **Linux, in Docker or another container.** A container's default security settings often stop the sandbox, and a container often runs its programs as root. Run byway outside the container. Playwright's Docker guide (https://playwright.dev/docs/docker) describes a seccomp profile for running Chromium with its sandbox in a container; byway has not tested it.
  - **Linux with unprivileged user namespaces switched off** (`kernel.unprivileged_userns_clone` or `user.max_user_namespaces` set to 0): someone with admin rights has to switch them on.
  - **macOS** is not supported yet.
- **If none of that is possible**, you can switch the sandbox off in Settings, knowing what it risks.

## Tests

```bash
pnpm verify         # all three below, in order, stopping at the first failure
pnpm -s typecheck
pnpm vitest run     # all packages and the app: no model or provider calls, no real keys (fakes, the gateway's mock, temp folders)
pnpm e2e            # Playwright, demo mode, production server, temp data directory, non-default ports
```

The unit run is not self-contained. The renderer tests launch Playwright's Chromium, so install it once (`pnpm --filter ./apps/web exec playwright install chromium`; on Linux, `pnpm --filter ./apps/web exec playwright install --with-deps chromium`, which also installs the system libraries Chromium needs; and on Ubuntu 24.04 and later, the script below as well). The engine tests start a local Temporal dev server, and the Temporal CLI is downloaded once when no cached copy exists, so the first run needs the network.

On Linux the unit run needs two more things, which CI's Linux job sets up (`.github/workflows/verify.yml`):

- The renderer tests start Chromium inside its OS sandbox, as byway does. Where AppArmor restricts unprivileged user namespaces (the default on Ubuntu 24.04 and later), Chromium's sandbox cannot start until a profile allows them for Playwright's Chromium: run `sh scripts/linux/allow-chromium-sandbox.sh` once first, after reading what else it allows ([The OS sandbox](#the-os-sandbox)). CI's Linux job runs the same script, after Playwright's install.
- Japanese text needs a CJK font that Chromium lays out correctly. With WenQuanYi Zen Hei as the fallback (Playwright's `install --with-deps` installs it), Chromium lays out the first item of a vertical row at no height, and one renderer test fails. Noto CJK (`fonts-noto-cjk`, as on Ubuntu's desktop) and IPAGothic lay it out as Windows does; CI installs Noto CJK and removes WenQuanYi Zen Hei.

`pnpm verify` is the gate to run before merging a branch ([ADR-0103](docs/adr/0103-adr-log-rule-and-ci.md)). For a commit that changes only documents, `pnpm vitest run scripts/test apps/web/test/guard-` runs, in seconds, the decision-log, CI and README checks and the app's guard tests, some of which read the README too. The last argument is a name filter, not a pattern, so it works in every shell. An edit to `protocol/03-configurations.md` also needs `packages/catalog/test/chooser`.

The end-to-end suite sets stand-in provider keys and fails if any of them appears in a request, a response or the web build's folder.

## CI

`.github/workflows/verify.yml` runs `pnpm verify` on GitHub's machines, one job per operating system: Windows (`windows-2025`) and Linux (`ubuntu-24.04`). macOS is not run yet; it will be one more job. A run starts on every push to main, once a week (Mondays 06:17 UTC, because the tests download Chromium and the Temporal CLI), and by hand (`gh workflow run verify.yml`). A newer run on the same branch, of any trigger (a push, the weekly run or a run started by hand), cancels one still going.

Each job installs the pinned Node (`.node-version`) and pnpm (`packageManager` in `package.json`), the dependencies from the lockfile, Playwright's Chromium (with its system libraries on Linux) and the Temporal CLI, then runs `pnpm verify`. On Linux it runs the README's AppArmor script after Playwright's install ([The OS sandbox](#the-os-sandbox)). It checks out the whole history, which the decision-log check reads. It uses no secrets: the browser tests set stand-in keys and fail if one leaks, so a run never reaches a paid provider.

CI reports and blocks nothing ([ADR-0103](docs/adr/0103-adr-log-rule-and-ci.md)). A red run puts a red mark on the commit, and GitHub notifies the account that pushed it (for the weekly run, the account that last changed its schedule), as that account's notification settings allow; no push is refused. Nobody else is told, so before merging a branch or pushing to main, look at the last run on main:

```bash
gh run list --branch main --limit 1     # "completed success" is green; "completed failure" is red
gh run view <run id> --log-failed       # which step failed, on which machine, and its output
```

A failed job also keeps, for 14 days, what the browser tests left: their server log (`e2e-server-log-windows` or `-linux`: byway's own output while the suite ran), once `pnpm e2e` has started, and Playwright's traces and screenshots of the browser tests that failed (`playwright-results-windows` or `-linux`). A job that failed before `pnpm e2e`, in its setup, the typecheck or the unit tests, keeps nothing, and a passing job keeps nothing. `gh run download <run id>` fetches them; `pnpm --filter ./apps/web exec playwright show-trace <trace.zip>` opens a trace.

A red run that is still red when run again (`gh run rerun <run id> --failed`) is a real failure: fix it before merging anything else. A test that fails only sometimes is named in the backlog and set aside, so red keeps meaning broken.

A risky change (for example the renderer's sandbox on Linux) is run on its branch before it merges. It merges when the Linux job passes and the Windows job passes or fails only on a timing flake already named in the backlog; any other failure is fixed first ([ADR-0107](docs/adr/0107-code-is-checked-before-it-is-pushed.md)):

```bash
git push origin <branch>                    # GitHub can only run a branch it has
gh workflow run verify.yml --ref <branch>
gh run list --branch <branch> --limit 1     # the run takes a few seconds to appear
gh run watch <run id> --exit-status         # waits for both jobs; fails if either does
```

After the merge, `git push origin --delete <branch>` removes the branch from GitHub.

## What's here

| Path | Contents |
|---|---|
| [protocol/](protocol/README.md) | The protocol: blocks, grammar, configurations C1–C7 and C6a, use-case evidence, More to Explore, runbook, sources, and a visual map |
| [docs/superpowers/specs/2026-10-07-product-v1-design.md](docs/superpowers/specs/2026-10-07-product-v1-design.md) | The product v1 design: architecture, how runs execute, recommending and composing, UX, credibility guardrails |
| [docs/superpowers/specs/2026-10-07-engine-recipe-core-design.md](docs/superpowers/specs/2026-10-07-engine-recipe-core-design.md) | The engine's recipe core (Milestone 0) |
| [docs/adr/](docs/adr/README.md) | Every architectural decision, with honest provenance (who decided, when, alternatives, evidence). The product's, from ADR-0064 on, are listed under [System](docs/adr/README.md#system) and [Product & program](docs/adr/README.md#product--program) |
| [docs/research/](docs/research/) | Research reports behind the decisions: protocol build reviews, harness and study research, and the credibility red team |

## Two tracks, one engine

1. **Research:** a testing harness and evaluation pipeline, and publishable studies. Paper 1 tests C1 against baselines, with leave-one-block-out ablations. Paper 2 tests generalization.
2. **Product:** a user brings a problem, and the product recommends a configuration or composes one from the blocks ([ADR-0042](docs/adr/0042-product-north-star-recommend-or-compose.md)).

Research credibility comes first, without compromise ([ADR-0043](docs/adr/0043-research-credibility-without-compromise.md)). The credibility charter is ADR-0044 to ADR-0057.

## Ground rules

- API keys never enter this repository ([ADR-0009](docs/adr/0009-api-key-fencing-constraints.md)).
- Accepted ADRs are append-only. A changed decision gets a new ADR that supersedes the old one ([ADR-0057](docs/adr/0057-tamper-evident-record-and-disclosure.md)). A test checks every Accepted record against main's history, so branches merge with `--no-ff` ([ADR-0103](docs/adr/0103-adr-log-rule-and-ci.md)).
- Product data stays out of research (ADR-0041 rule 3), and labels are computed, never typed (CR11).
