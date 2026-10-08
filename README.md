# byway

The research program and product built on the **Off-Center protocol**: eight composable blocks, a small grammar and a set of configurations that generalize Anshu Chimala's "How to turn your AI into a world-class designer" (Lenny's Newsletter, Sep 1 2026) beyond design.

**The product** is a local-first web app. You describe what you are working on in your own words; byway recommends one of the eight configurations (or composes one from the blocks), shows its steps and who does each, and runs it with you: the AI does the AI steps, you do the human ones (pick, react, trim, compare, write) inside the app, and you take the deliverable away (a page, a memo, a story, options, a storyboard, a diff). Every recipe is labelled honestly: the configurations are **untested** until the studies report, and a composed recipe says it is composed and not tested. byway makes no claim that a recipe works better than any other way of working.

**The research track** builds the harness and studies that will test the configurations ([ADR-0043](docs/adr/0043-research-credibility-without-compromise.md): research credibility comes first). Product data never feeds a study.

## Quick start

Requires Node 24+ and pnpm 11+. Windows, macOS and Linux.

```bash
pnpm install
pnpm demo        # byway with sample outputs: no keys, no AI calls, nothing charged
```

Open http://127.0.0.1:3000. Ctrl+C stops everything.

To use real models, put your provider keys in `.env.agents` at the repo root (it is gitignored; **never commit keys**), then:

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

Keys are read from the process environment (a key exported in your shell wins over the file). They never enter the database, the ledger, artifacts, logs, prompts or the browser, and nothing byway writes under the repo holds them: the web build gets no keys, and Next.js's build caches, which would keep a copy of the environment, are off (byway removes any an earlier version left in `apps/web/.next`). Every run has a budget, and the workspace has one too; a run stops and asks before it would spend more.

## Scripts

| Command | What it does |
|---|---|
| `pnpm start` | **The way to use byway.** Opens the data directory, starts a local Temporal server and the runner worker in one process, builds the web app (`next build`) and serves it (`next start`) on 127.0.0.1:3000, with real models for the providers that have keys (demo mode can still be switched on in Settings) |
| `pnpm demo` | The same with the mock provider forced on: sample outputs, no AI calls, nothing charged |
| `pnpm dev` | Contributor mode, with hot reload: `next dev` runs inside byway's own server on 127.0.0.1:3000, which checks every request and WebSocket first and is the only port the web app listens on (see Architecture). `pnpm dev -- --demo` forces the mock |
| `pnpm e2e` | The Playwright end-to-end suite: starts `pnpm demo` on a temp data directory and free ports, with the web app built into its own folder (`apps/web/.next-e2e`) so a byway you are running is not rebuilt under you; runs C1, C3, C4, C5 and C6a from a typed problem to the Result screen, then stops it and cleans up |
| `pnpm vitest run` (or `pnpm test`) | Unit, integration, conformance and guard tests for every package and the app |
| `pnpm -s typecheck` | TypeScript across the packages, the scripts and the app |
| `pnpm --filter ./apps/web run build` | Production build of the web app |
| `pnpm byway validate recipes/c1h.json` | Check one recipe against the grammar (exit 0 ok, 1 violations, 2 unreadable) |
| `pnpm recipes:emit` | Regenerate `recipes/*.json` after changing the catalog |

`pnpm start`, `pnpm demo` and `pnpm dev` take `PORT` (web, default 3000), `BYWAY_TEMPORAL_PORT` (default 7233) and `BYWAY_DATA_DIR`. If the run engine stops while byway is running, byway says so and stops; start it again. The first start downloads the Temporal dev server once; later starts reuse it. Web-page recipes render pages with Playwright's Chromium (`pnpm --filter ./apps/web exec playwright install chromium` if it is missing).

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
| `byway.sqlite` | Workspaces, intakes, runs, run events, checkpoints, preferences |
| `artifacts/sha256/…` | Every artifact (pages, documents, renders, images, clips), content-addressed |
| `ledger.jsonl` | One hash-chained entry per model, image or video call: purpose, model, usage, cost (bodies by hash) |
| `temporal.sqlite` | The local Temporal server's state, so runs survive a restart |

## Tests

```bash
pnpm vitest run     # all packages and the app; no network, no real keys (fakes, the gateway's mock, temp folders)
pnpm -s typecheck
pnpm e2e            # Playwright, demo mode, production server, temp data directory, non-default ports
```

The end-to-end suite sets stand-in provider keys and fails if any of them appears in a request, a response or the web build's folder.

## What's here

| Path | Contents |
|---|---|
| [protocol/](protocol/README.md) | The protocol: blocks, grammar, configurations C1–C7 and C6a, use-case evidence, More to Explore, runbook, sources, and a visual map |
| [docs/superpowers/specs/2026-10-07-product-v1-design.md](docs/superpowers/specs/2026-10-07-product-v1-design.md) | The product v1 design: architecture, how runs execute, recommending and composing, UX, credibility guardrails |
| [docs/superpowers/specs/2026-10-07-engine-recipe-core-design.md](docs/superpowers/specs/2026-10-07-engine-recipe-core-design.md) | The engine's recipe core (Milestone 0) |
| [docs/adr/](docs/adr/README.md) | Every architectural decision, with honest provenance (who decided, when, alternatives, evidence); the product's are ADR-0064 to ADR-0072 |
| [docs/research/](docs/research/) | Research reports behind the decisions: protocol build reviews, harness and study research, and the credibility red team |

## Two tracks, one engine

1. **Research:** a testing harness and evaluation pipeline, and publishable studies. Paper 1 tests C1 against baselines, with leave-one-block-out ablations. Paper 2 tests generalization.
2. **Product:** a user brings a problem, and the product recommends a configuration or composes one from the blocks ([ADR-0042](docs/adr/0042-product-north-star-recommend-or-compose.md)).

Research credibility comes first, without compromise ([ADR-0043](docs/adr/0043-research-credibility-without-compromise.md)). The credibility charter is ADR-0044 to ADR-0057.

## Ground rules

- API keys never enter this repository ([ADR-0009](docs/adr/0009-api-key-fencing-constraints.md)).
- Accepted ADRs are append-only. A changed decision gets a new ADR that supersedes the old one ([ADR-0057](docs/adr/0057-tamper-evident-record-and-disclosure.md)).
- Product data stays out of research (ADR-0041 rule 3), and labels are computed, never typed (CR11).
