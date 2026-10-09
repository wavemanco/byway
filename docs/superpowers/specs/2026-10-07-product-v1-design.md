# byway product v1

**Status:** design for implementation, 2026-10-07. The user asked to "go with the product track. complete it first. use subagents with dedicated worktrees if needed." Decisions the user did not make explicitly are recorded as Delegated ADRs ([ADR-0064](../../adr/0064-product-v1-local-first-web-app.md) to [ADR-0068](../../adr/0068-contracts-first-parallel-build.md)).

## 1. What v1 is

A **local-first web app** on the shared engine ([ADR-0041](../../adr/0041-shared-engine-pinned-research-versions.md)) that delivers the north star ([ADR-0042](../../adr/0042-product-north-star-recommend-or-compose.md)):

1. You describe a problem in your own words.
2. byway recommends one of the eight configurations (C1–C7, C6a) through the protocol's chooser, or composes one from the blocks when none fits ([ADR-0058](../../adr/0058-design-time-composition-only.md)), with an honest evidence label (all "Untested" until studies report, CR11).
3. You run it end to end. The AI does the AI steps; you do the human steps (pick, react, trim, compare, write) inside the app.
4. You get the deliverable (a page, a memo, a story, options, a storyboard, a diff) and can export it.

**Done means:** all eight configurations run end to end in demo mode (mock models, no keys) and, with keys in `.env.agents`, against real models; every human checkpoint has a working UI; the recommender and composer work; labels are computed; product data stays out of research; the whole thing starts with one command and is covered by unit, integration and end-to-end tests.

**Not in v1:** hosted multi-user deployment and auth, billing, the MCP/skill channels, mobile layouts beyond responsive basics, the research harness's Judge app and study machinery, and video generation when no fal.ai key is configured (the C5 step then stops at the storyboard and images, and says so).

## 2. Architecture

```
apps/web            Next.js 16 product app (UI + route handlers). Temporal client. Binds 127.0.0.1.
packages/contracts  Shared interfaces (gateway, store, runner, advisor, presentation).   [done in Phase 0]
packages/protocol   Ports, blocks, rules, exceptions, media.                              [exists]
packages/recipe     Recipe IR, hashing, derivations.                                      [exists]
packages/validator  Rule checks.                                                          [exists]
packages/catalog    Recipes C1–C7, C6a (+ Study 1 arms), presentation data, chooser data. [WP-A extends]
packages/gateway    Model gateway: providers, profiles, prices, ledger, caps, mock.       [WP-C]
packages/store      SQLite (node:sqlite) records + content-addressed artifact files.      [WP-S]
packages/prompts    Versioned prompt templates for every prompt id, and a renderer.       [WP-P]
packages/runner     Temporal workflow interpreter, activities, worker, dev engine.         [WP-D]
packages/advisor    Recommender (chooser + intake), composer, labels, estimates.          [WP-E]
```

Dependency direction: `web → {advisor, runner (its `./client` entry only), store, gateway, prompts, catalog, contracts}`; `runner → {gateway, store, prompts, catalog, recipe, validator, contracts}`; `advisor → {gateway, prompts, catalog, recipe, validator, contracts}`; nothing in `packages/` imports `apps/`. A guard test (`apps/web/test/guard-boundaries.test.ts`) enforces these sets. The research evaluation side (future `py/eval`, judge instruments) is never imported by product code (CR12).

**Process model (local).** `pnpm dev` starts: a local Temporal dev server (via `@temporalio/testing` `TestWorkflowEnvironment.createLocal` with a persistent `dbFilename`, port 7233), the runner worker, and `next dev` on `127.0.0.1:3000`. `pnpm demo` does the same with the mock provider forced on.

**Temporal on this machine.** SWC (Temporal's default workflow transpiler) refuses its cache folders here because their permissions include a sandbox group. Workflow code is therefore compiled to JavaScript with esbuild first (`packages/runner/scripts/build-workflows.ts`), and the worker bundles the `.js` (verified in a spike: a workflow with an activity and a human Update completed). The esbuild step must bundle all workspace imports into that one file (only `@temporalio/*` stays external), because the workspace packages export TypeScript sources that Temporal's bundler would otherwise hand to SWC.

**Data.** `BYWAY_DATA_DIR` (default `%LOCALAPPDATA%\byway` on Windows, `~/.byway` elsewhere; never inside OneDrive or the repo). It holds `byway.sqlite`, `artifacts/sha256/…`, `ledger.jsonl` and `temporal.sqlite`.

**Keys.** Read from the process environment, loaded at startup from `.env.agents` at the repo root if present (gitignored, ADR-0009). Variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `FAL_KEY`. Keys never enter the database, the ledger, artifacts, logs, prompts or the browser.

## 3. Runs: how a recipe executes

The runner interprets the recipe tree (`byway.recipe/1`) as a Temporal workflow. Workflow state holds port values by reference (artifact ids, short texts); activities do all I/O.

### 3.1 Port values

| Port | Value |
|---|---|
| `intent` | The problem text plus brief fields |
| `brief` | Text |
| `artifact` | An artifact id; its format comes from the recipe's `medium` (`MEDIUM_FORMAT`) |
| `view` | For `web-page`: labelled PNG renders of three surfaces — wide screen (full page at 1440, tiled to ≤ 2576 px per tile), phone (390 wide, tiled) and first screen (1440×900) — narrowed by a render step's `renders` knob ([ADR-0079](../../adr/0079-phase-4-runner-records.md)). For `media`: the storyboard text and each shot's frame. For `text` media: the artifact's clean text |
| `critique` | Text |
| `score` | Number parsed from the critic's "Score: N/10" line (or rank) |
| `taste`, `voice` | Human text |
| `tells` | The tell catalog text for the medium (from `@byway/prompts`) |
| `refs` | Artifact ids supplied by the user |
| `seed` | Generated in an activity with `crypto.randomBytes`; passed to SEED steps only; the runner checks it never appears in the work: artifacts, views and notes of the run (PR3; the gateway's stored request bodies necessarily contain it) |
| `option_set<artifact>` | An ordered list of artifact ids (candidates) |
| `anchor` | The artifact id of a relay link's exact end state (C5: the last frame of a clip), which the next link starts from |
| `asset` | Artifact ids of generated media kept beside the work (C2: rough mood images that never become the deliverable) |

### 3.2 Step execution

| Step | Executor |
|---|---|
| `actor: model` (build, seed, fix, asset, critic, judge, check, cut proxy, tells-sweep, tells-compare proxy, select, vision) | `modelStep` activity: render the step's prompt template with its slots, call the gateway at the step's tier, parse the output by role (HTML/markdown/JSON extraction for builders; critique + score for critics; a label for judges and selectors; a directive for CUT; hits for the TELLS sweep; keep/revert for the TELLS compare) |
| ASSET on `web-page` | `assetStep`: ask the model for up to the slot count of image briefs (JSON), generate them through `gateway.image`, then ask the model to integrate them; images are served from the artifact store |
| `actor: tool`, role `render` | `render` activity: Playwright Chromium, network blocked except an allowlist (Google Fonts, jsDelivr, unpkg, cdnjs, the local artifact route), reduced motion, fixed viewport; prose media return the text |
| `actor: human` | Open a checkpoint (kind by role, below), wait for the `resolveCheckpoint` Update, map the resolution to the step's produced ports |
| `pick(H,k)` | Checkpoint `pick` with the candidates' renders |
| `pick(C,k)` | The pick's judge step via `modelStep`, returning labels |
| `optional` | Checkpoint `confirm` with the trigger text as the question |
| `route` | The choice in `StartRunInput.routes`, else checkpoint `choose` |
| `loop` | Run the body; after each iteration compare the critic's score with the hidden threshold (never put in any critic prompt); stop at the threshold, at the plateau rule or at `max`; at the cap with `onCap: human`, checkpoint `confirm` ("Use the best version so far?"); best-snapshot re-rank as a fresh judge call |
| `replicate n` / `each` | Run candidates concurrently inside the workflow; candidate index recorded on events and checkpoints |
| `audit` | Run the lenses concurrently on the same input; their critiques and scores are annotations shown to the user and never written into the work |
| `gate` (one-shot) | Run the body once and compare with the hidden pass condition; on a fail re-run `retry.stage` up to `retry.times`, then checkpoint `confirm` |
| `relay` | One link per storyboard shot (up to `maxLinks`), strictly in sequence; the first link starts from shot 1's frame (the anchor-frames ASSET step), each next one from the previous clip's last frame. Relay model steps answer `relay:media`; the runner then calls `gateway.video` ([ADR-0069](../../adr/0069-product-c5-relay-and-honest-skips.md)) |
| ASSET on `options`, `media`, `prose` | `asset.briefs:<medium>` → `gateway.image` per brief; on `prose` then `asset.integrate:prose`; on `options`/`media` the runner attaches `imageArtifactId` to each option or shot (no integrate call) |
| Steps with no v1 executor (C5 `matte`, `vo-audio`), and relay links without a usable video model | Finish as skipped with a plain note ("Compositing is not available in byway yet", "No voice-over audio provider is configured", "No video provider key is configured"); the artifact and anchor pass through unchanged (ADR-0069) |

**Critic modes.** A GREAT-mode critic runs in GREAT mode only with at least 3 user-supplied references (up to its `refs` knob, shuffled); with fewer it runs in OK mode against the hidden 9/10 bar and the step says so ([ADR-0071](../../adr/0071-great-critic-falls-back-to-ok-without-references.md)). `critic-rank` gates pass when the rank is at or better than the threshold (lower is better); `critic-score` gates when the score reaches it. Loops with metric `human` open a `confirm` checkpoint after each round ("Is this ready?"; yes ends the loop); `check-clean` loops stop when the check answers `No defects.`.

**Prompt slots by port.** The runner fills: `intent` → `problem`; `brief` → `brief`; `artifact` → `artifact` (never for critic, judge, check, tells-sweep or tells-compare steps: port rule 1); a text `view` → `view`, a screenshot `view` → attached images; `option_set` → `options` (labelled A, B, C…); `critique` → `critique` (audit lenses joined under their names); `taste`, `voice`, `tells`, `seed`, `refs` → slots of the same name (reference images are attached); `score` never reaches a prompt (port rule 2).

**Views by medium.** `web-page`: Playwright screenshots of the wide screen, the phone and the first screen, each captioned. `prose`: the clean Markdown text. `options`: the options as a numbered plain-text list (labels A, B, C… when several sets are compared). `media`: the storyboard as text plus each shot's frame image when it exists. `code-diff`: the diff text.

**Human checkpoint kinds by role:** `vision` → `react`; `cut` → `directive`; `tells-compare` → `compare`; `voice` → `write` (initial text = the copy extracted from the artifact; the edited copy is written back by a model step that changes only text and is checked by a diff); the author's draft in C6/C6a → `write`.

Every step emits `step-started`/`step-finished` events with cost; every artifact emits `artifact`; the run ends with `run-finished` and the output artifact id.

### 3.3 Purposes and output contracts

Prompts (WP-P), the runner's parsers (WP-D) and the mock provider (WP-C) must agree exactly. Every gateway call carries a `purpose`:
- recipe steps: `<role>:<medium>`, e.g. `build:web-page`, `critic:prose`, `cut:web-page`, `tells-sweep:prose`;
- helpers: `asset.briefs:web-page`, `asset.integrate:web-page`, `voice.apply:<medium>`, `rerank:<medium>`, `advisor.intake`, `advisor.compose`, `advisor.compose.repair`.

| Purpose (role) | The model must answer with |
|---|---|
| `build`, `seed`, `fix`, `asset.integrate`, `voice.apply` on `web-page` | One fenced `html` block holding a complete HTML document (inline CSS/JS; images by the URLs given) |
| same, on `prose` | The Markdown document (optionally in one fenced `markdown` block) |
| same, on `options` | One fenced `json` block: `{"options":[{"title":string,"pitch":string,"rationale":string}]}` |
| same, on `media` | One fenced `json` block: `{"storyboard":[{"shot":number,"description":string,"imagePrompt":string,"durationSec":number,"caption"?:string}],"voiceover":string,"headline"?:string,"tagline"?:string}` (the on-screen copy — headline, tagline, captions — is what the late VOICE edits; the voice-over is locked after the VO script step) |
| same, on `code-diff` | One fenced `diff` block (unified diff), then a paragraph starting `Why:` |
| `critic` | OK mode: the critique as a bullet list, biggest gaps first, then a last line `Score: N/10`. GREAT mode: one `### X` section per item of the lineup, then a last line `Ranking: C, A, E, B, D` (every label once, best first). The critic is never told which item is ours; the runner finds our rank and hands only our item's section to the fix step ([ADR-0072](../../adr/0072-great-critic-ranks-blind.md)). In a mixed-form lineup every item is one card image; a critic that reads text also gets every item's whole words under its label, and an image-only critic's card shows as many words (characters, for text without spaces) as fit one image and ends with a line saying how many were left out; the verdict carries a sentence saying whose words were cut, for the step's note ([ADR-0087](../../adr/0087-lineup-evidence-full-words-and-disclosed-card-budget.md)) |
| `judge`, `select`, `rerank` | Optional reasoning, then a last line `Choice: <label>` (labels A, B, C…) |
| `check` | A bullet list of defects, or the single line `No defects.` |
| `cut` (model) | A bullet list of removals, each starting with a removal verb (Remove, Delete, Drop, Merge), or the single line `Nothing to remove.` |
| `tells-sweep` | One fenced `json` block: `{"hits":[{"pattern":string,"where":string,"alternative":string}]}` |
| `tells-compare` (model) | Optional reasoning, then a last line `Keep: A` or `Keep: B` |
| `vision` (model) | Plain text |
| `asset.briefs` | One fenced `json` block: `{"images":[{"slot":string,"prompt":string,"alt":string,"size":"1024x1024"\|"1536x1024"\|"1024x1536"}]}` |
| `advisor.intake` | One fenced `json` block: `{"answers":[{"questionId":string,"answer":boolean,"confidence":number,"rationale":string}],"routes":{[routeId]:string}}` |
| `advisor.compose`, `advisor.compose.repair` | One fenced `json` block holding a `byway.recipe/1` object |
| `dedupe:<medium>` | One fenced `json` block: `{"keep":[label…],"merged":[{"into":label,"from":[label…]}]}` (labels A, B, C… of the options shown) |
| `overlap:<medium>` | One fenced `json` block: `{"flags":[{"label":label,"overlapsWith":string,"note":string}]}` (annotation only) |
| `relay:media` | One fenced `json` block: `{"clipPrompt":string,"durationSec":number}` — the runner generates the clip from the previous anchor when a video provider is configured; otherwise the step finishes skipped with the note "No video provider key is configured" |
| `asset.briefs:<medium>` | As for web-page: `{"images":[{"slot","prompt","alt","size"}]}`; on `media` one image per storyboard shot (slot = shot number), on `options` one mood image per option (slot = option label), on `prose` illustrations only where the text asks for them |
| `asset.integrate:prose` | The Markdown document with image links (`/api/artifacts/<id>`) placed where they belong; on `options` and `media` there is no integrate call — the runner attaches `imageArtifactId` to each option or storyboard shot |

Parsers take the last fenced block of the expected language, fall back to the whole text, and fail the step with a clear message when the contract is not met (one automatic retry with the parse error appended).

**SEED in the product.** The article has the model generate its random string with a shell command; the product has no shell, so the runner generates the string (`crypto.randomBytes`) and the SEED prompt hands it over with the article's instructions (interpret it for direction, never reveal it). This is a declared product deviation; the PR3 check verifies the string never appears in the work.

**Storyboards.** The runner adds `imageArtifactId` to each storyboard shot when it stores the shot's frame, and `clipArtifactId` when a relay link produced a clip.

**Provenance.** Every completion carries its template's id, version, hash and fidelity (`CompletionRequest.prompt`), and the gateway writes them into the hash-chained ledger entry.

**Spend authority.** The gateway's ledger is the source of truth for spend, in demo mode too (the mock records $0 entries).

### 3.4 Spend

The run's budget is enforced by the gateway; when it would be exceeded the step fails with `budget-exceeded`, the run pauses on a `confirm` checkpoint ("Raise the budget by $X?"), and the UI shows the cost so far.

## 4. Recommending and composing

**Chooser.** The seven questions of 03 "Choosing a configuration" are data (`packages/catalog/src/chooser.ts`, `ChooserQuestion[]`); the first "yes" decides. The **intake** model reads the problem and proposes an answer, confidence and one-line rationale per question (JSON); the user can flip any answer and the routing re-runs deterministically. Fit is `strong` when the deciding answer has confidence ≥ 0.7 and `partial` otherwise. Up to two alternatives are the next "yes" answers. When no question is answered yes, the recommendation is 03's fallback, C4 Reader-Ready (`CHOOSER_FALLBACK`), as a `partial` fit with `composeSuggested: true`.

**Composer.** Design-time only (ADR-0058). The composer model receives the block registry (codes, purposes, port signatures, knobs) and the nearest canonical recipe, and returns a recipe JSON on the `workspace` channel with `kind: 'composed'`. It is parsed and validated; violations go back to the model for at most two repairs; only a recipe that validates is offered. Composed recipes may use only registered blocks, knobs within range, no study manipulations and no protocol exceptions other than those their nearest canonical recipe declares; human checkpoints for VOICE and for authorship in C6/C6a are protected. The UI shows the composed recipe as a diff from the nearest canonical one, labelled "Composed — not tested".

**Labels (CR11).** Computed by `advisor.label(recipe)` from the study registry. The registry is empty in v1, so canonical recipes read "Untested — not yet studied" and composed ones "Composed — not tested". No UI string may claim efficacy ("research-backed", "proven", "studies show", "outperforms"); a CI check scans `apps/web` for these phrases.

**Estimates.** From the recipe's structure (replicate counts, loop `max`, steps per stage) times the profile's prices, as a low–high range, plus human minutes by checkpoint kind.

## 5. Product UX

Apple-grade means Apple's quality bar in a web app ([ADR-0040](../../adr/0040-plain-language-recipe-first-ux.md), proposed, adopted here for the product): purpose, agency (undo where safe; clear consequences before spending), restraint, craft (alignment, density, ≤100 ms interactions), familiarity (standard shortcuts), light and dark, WCAG 2.2 AA. It must itself avoid the design tells the protocol fights (no purple-gradient hero, no eyebrow labels on everything, no card soup, at most two typefaces).

**Vocabulary (plain by default; "Show technical names" reveals codes):** stages Explore / Refine / Finish; Random spark (SEED), Your direction (VISION), Outside critique (CRITIC), Custom imagery (ASSET), Motion (RELAY), Trim (CUT), Cliché sweep (TELLS), Your words (VOICE); Your turn (checkpoint); Drafts (option set); Quality bar (hidden threshold). Recipes: C1 Landing Page Studio, C2 Idea Generator, C3 Series Writer, C4 Memo Polish, C5 Ad Video Chain, C6 Second Reader, C6a Fiction Second Reader, C7 Lean Code Review.

**Screens.**
1. **Start** — one large field, "What are you working on?", with a few example problems; attachments (paste a draft or a diff).
2. **Recommendation** — the recommended recipe as a card (name, promise, the three-stage step strip with who does each step, time and cost range, evidence label, "routing untested" note), the chooser answers as editable toggles with rationales, alternatives, and "Build my own" (compose). Primary action: "Start" with the budget shown.
3. **Run** — a timeline grouped by Explore / Refine / Finish; each step a quiet row with status, cost and its outputs (thumbnails for pages, excerpts for text); a "Your turn" panel that takes over when a checkpoint is open: drafts contact sheet for `pick`, side-by-side compare with Flip for `compare`, a focused editor for `write`, a list editor for `directive`, a text area for `react`, a clear yes/no for `confirm`; live cost meter against the budget; Pause and Cancel always visible.
4. **Result** — the deliverable: a page in a sandboxed iframe (`sandbox="allow-scripts"`, no `allow-same-origin`, served with a strict CSP from the artifact route), rendered Markdown, an options list, a storyboard, or a diff viewer; export (HTML, Markdown, JSON, patch); "How this was made" (the steps, who did what, cost).
5. **Library** — the eight recipes with their promises and labels; start any directly.
6. **History** — past runs with status and cost; open waiting runs ("Your turn") first.
7. **Settings** — providers (configured or not, never the key), model profile, workspace budget, demo mode, "Show technical names".

**Demo mode.** With no keys, or when forced, the gateway's mock provider returns deterministic, plausible outputs for every role and medium so the whole product is navigable; a quiet banner says "Demo mode — sample outputs, no AI calls".

## 6. Credibility guardrails in the product

- Product recipes and runs live on the `product`/`workspace` channels; product data lives in the product data directory and never feeds a study (ADR-0041 rule 3).
- Labels are computed; claims are linted (section 4).
- Product code never imports evaluation instruments (CR12); a CI check enforces the import boundary.
- Every model call goes through the gateway and its ledger (CR7-style hash chain).

## 7. Work packages

Each package is built test-first in its own git worktree under `.worktrees/<name>` on branch `product/<name>`, against `packages/contracts`. Workers must not edit `packages/contracts`, root config files or another package's files; if a contract change is truly needed they stop and report it.

**Phase 1 (parallel):**

- **WP-A catalog** (`product/catalog`): add the IR operators the 03 wirings need (at least parallel audit `{{ A ‖ B }}`; any of lanes, one-shot gate with retry, relay chain that C2–C7 and C6a require), their validator rules, the protocol-declared exceptions of 03's table (clause-scoped), and recipes `c2`, `c3`, `c4`, `c5`, `c6`, `c6a`, `c7` on the `protocol` channel with their `medium`; presentation data for all eight (`RecipePresentation`) and chooser data (`ChooserQuestion[]`); conformance tests as for C1 (each validates with exactly its exceptions, each exception needed, drift test). Existing recipe hashes must not change.
- **WP-C gateway** (`product/gateway`): `@byway/gateway` implementing `Gateway` with Anthropic, OpenAI, Google, OpenRouter (pinned provider, no fallbacks) and mock providers; verified model ids and a dated price table; profiles (`balanced`, `best`, `demo` at least, plus OpenAI/Google profiles when keys exist); `.env.agents` loading; hash-chained JSONL ledger; workspace and run caps with pre-call estimates; retries; the mock's deterministic responders for every role and medium (driven by `purpose`). No network in tests.
- **WP-S store** (`product/store`): `@byway/store` implementing `Store` and `ArtifactStore` with `node:sqlite` and content-addressed files; migrations; WAL; per-run event sequence; tests on temp directories.
- **WP-F web** (`product/web`): `apps/web` with every screen and checkpoint UI of section 5, working against in-memory demo services that implement the contracts; design system (tokens, light/dark); accessibility; unit tests for view logic.

**Phase 2 (parallel, after Phase 1 merges):**

- **WP-P prompts** (`product/prompts`): `@byway/prompts` with a template for every prompt id in the protocol-channel catalog recipes plus advisor and runner helper prompts; front matter (id, version, slots, output contract, fidelity: `verbatim` | `paraphrase` | `project`); strict renderer; static checks that no critic prompt contains a threshold and no generation or critic prompt contains the tell catalog.
- **WP-D runner** (`product/runner`): `@byway/runner` as section 3, the `Runner` client, the worker, the dev engine, esbuild workflow build; tests with `TestWorkflowEnvironment` and the mock gateway.
- **WP-E advisor** (`product/advisor`): `@byway/advisor` as section 4.

**Phase 3:** integrate `apps/web` with the real services; `pnpm dev` and `pnpm demo`; Playwright end-to-end tests in demo mode for at least C1, C4 and C6a; the claims and import-boundary checks; README.

**Phase 4:** adversarial review (correctness, UX, credibility guardrails, security), fixes, and a final verification run.
