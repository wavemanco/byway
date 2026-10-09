# Backlog

Items deliberately parked so the work can stay on code ([ADR-0062](adr/0062-code-first-work-mode.md)). People and outside actions are in the [playbook](playbook.md).

## Pricing (parked 2026-10-07)

All figures are estimates from the Study 1 design pass ([protocol v1.1 §13](study1/protocol-v1.1-draft.md)); none is a quote.

| Item | Estimate | Notes |
|---|---|---|
| **Study 1 core** at 72 briefs (pre-pilot, pilot, generation, lay and expert rating, Monitor, copywriter, red team, legal, compute, hosting) | ~$100k central (range ~$66–141k) | Up from the earlier ~$24k because generation was re-priced (the critic and finishing steps and the growing context were under-priced), rater sessions are 30 minutes, and the Monitor, copywriter, red team, legal, compute and hosting lines were added. |
| Cost probe on public engineering briefs | ~$1.4k | Once the registry entry and spend gate exist. Replaces the token assumptions. |
| Pilot (all arms, 12 sealed development briefs, ~1,500 lay judgments) | ~$5.5k | Only after the Monitor is contracted. |
| Integrity Monitor | ~$10–20k (80–150 hours) | Fixed fee. |
| Red team | ~$1–3k per round, two rounds | |
| Charter add-ons overall | ~$5–15k | |
| Compute-matched best-of-N arm (B-BoN) | ~$6k | Part of the recommended baseline set (D1). |
| Frontend-design skill arm (B-Skill) | ~$3k | Part of the recommended baseline set (D1). |
| Outside baseline (B-Outside) | ~$2.6k + coordination | Required by CR5 in some form. |
| H1c test + positive control | ~$1.7k | Accepted (ADR-0061). |
| Regeneration reserve | ~$15–20k, contingent | Only if Stage 1 reviewers change the generation protocol after escrowed generation. |
| Lean variant (60 briefs) | saves ~$8–9k | Not chosen: 72 briefs accepted (ADR-0061). |
| GPT-5.6 Sol worker arm | ~$2–2.5k | Deferred to Paper 2 (ADR-0061). |
| Study 1b (C1-HITL, 8 operators) | ~$13–17k | Decoupled Registered Report (ADR-0061). |
| Quotes still needed | — | Monitor, copywriter, red team, legal, IRB, recruiting vendor, CODECHECK. |
| **Set the Study 1 spending ceiling** | — | After the cost probe and the quotes (D13). |

## Study 1 protocol v1.2 edits (found while building the engine)

| Edit | Why |
|---|---|
| SM-5's row in §5.6 should list DR3 (isolation), DR4 (hidden threshold) and DR5 (judge tier) as well as port rules 1 and 2 | CRITIC-self necessarily breaches them; the engine's SM-5 relaxes them, clause-scoped, and the paper's exception table should match |
| State that the C1-H critic receives one desktop render and that CRITIC-check sits out in every C1-H arm (already in S1-BIND and deviation 14) in the arm table itself | The engine recipes now encode this; a reviewer comparing hashes with §3 should find it stated where the arm is defined |
| B-BoN's N | Stage 1 fixes N from pilot costs; the recipe carries a planning value (5) and is regenerated with the final N |

## Product follow-ups (found while building v1)

| Item | Why | Where |
|---|---|---|
| C7's spec interview: let `implement` read the interview's brief | The validator's must/may typing rejects consuming a port only an optional produces (ST5), so the brief is written and never used. Proposal: an optional-read field on steps (`reads`, checked against `may`, still under port rules 1 and 5), the runner filling the slot only when the port has a value; c7's hash changes. Needs an IR ADR. | recipe, validator, runner, catalog |
| Widen `VideoResult.mediaType` beyond `video/mp4` | A provider returning another container (e.g. webm) is billed, stored and then refused | contracts, gateway |
| Expose `withdrawnAt` on `CheckpointRecord` | The store records it; the app cannot show when a question was withdrawn | contracts, store |
| Templates for the Study 1 research arms' prompt ids (`article.B1`, `study1.*`) | Research recipes are not in the product library; a product run of one would fail with unknown-template | prompts (research track) |
| Cancel stops calls already in flight | Cancel refuses new provider calls, but one in flight runs to completion and is billed; needs an optional `signal` on gateway requests honoured by the SDK clients (ENG-4 remainder) | contracts, gateway, runner |
| Cost in "Run this step?" and "Is this ready?" questions | The runner has no per-step estimate; the advisor's estimator would have to move or be shared (UX-4 remainder) | runner, advisor |
| C2 JSON export carries the mood boards; demo option-map flags follow "Chosen / Not chosen" | The Result shows the mood boards beside the options, but the JSON export does not include them (UX-8 remainder) | apps/web, gateway mock |
| `startDevEngine({ workflowsPath })` | A running byway and `pnpm e2e` from the same checkout both rebuild `dist/workflows.js` (same bytes) (DEV-1 remainder) | runner |
| Gateway mock's fenced-block reader | `mock/extract.ts` still uses the lazy regex the runner replaced (ENG-1); demo only | gateway mock |
| Temporal metrics port has no Host check | Read-only metrics; not probed for DNS-rebinding reads (Phase 4 re-check, low) | runner |
| Reconcile lost runs while the engine runs, not only at start | A workflow terminated from outside (now only via local gRPC) stays "waiting" until the next start (Phase 4 re-check, low) | runner |
| Advisor diff as structured data | The web strips step ids from "How it differs" lines; the advisor could return structured differences (UX-13 remainder) | advisor, apps/web |
| Provider-reported usage and cost must be finite before the ledger draft | A JSON `1e400` token count or cost makes the ledger append throw after billing, so the call is billed but not counted (ENG-3). Handed to the F03 spend-book work; drop when it lands (ADR-0083) | gateway |
| Renderer egress: narrow the CDN allowlist | It admits any npm package through unpkg and jsDelivr (host-only). Decide whether to pin paths or require SRI (ADR-0084) | runner |
| Playwright bump policy | Playwright is pinned at 1.63.0, so its Chromium accumulates known n-day bugs. Set a bump cadence and re-check the launch-failure texts on each bump (ADR-0084) | runner, release |
| Windows: Chromium's network service runs at Medium integrity | Even with the OS sandbox on, the broker and network-service utility stay at Medium. Investigate whether the network service can be sandboxed; add no untested flag (ADR-0084) | runner |
| Renderer environment as an allowlist | The scrub is a deny-list: a secret exported in the shell under a harmless-looking name still reaches Chromium. Switch to an allowlist once the needed Linux/macOS font and locale variables are known (ADR-0084) | gateway, runner |
| Protocol runbook's RENDER snippet | protocol/06-runbook.md §1 calls chromium.launch() with Playwright's defaults (no sandbox, full environment); the protocol track should decide on it so harness users do not copy it | protocol (research track) |
| Confirm fal's live media host set | First, at no cost, read the stored response of any earlier live C5 relay link (video.url, wire.media.clip, wire.media.frame). Otherwise run one live link if the owner chooses. Until confirmed, a clip served outside fal.media fails after billing, one clip per attempt, with the host named (ADR-0088) | gateway |

## Owner decisions from the external-review verification (2026-10-08)

Everything else from [the verification](reviews/2026-10-08-external-review-verification.md) is implemented or scheduled; these four wait on the owner.

| Decision | What waits on it | Today |
|---|---|---|
| D1 Anthropic server-side refusal fallbacks off? | F04's fallback overrun (a refused call can settle at up to about 2× its reservation; sticky routing). Turning them off keeps caps exact and matches the research protocol, but a classifier false positive then fails the step instead of being rescued | On (unchanged) |
| D2 Renderer's Chromium OS sandbox on? | The OS-containment half of F18. Hosts that cannot start it would stop rendering (Linux with restricted user namespaces, root, containers); also decide whether an owner opt-out should exist, printed at start-up and never automatic. Switching on needs: `RENDERER_OS_SANDBOX` in packages/runner/src/pages.ts, a plain message for Playwright's 'Chromium sandboxing failed!', a drift test on that text, a README section on a per-binary AppArmor profile, and the test that pins the value | Off (unchanged; stated in the start-up line and ADR-0084) |
| D3 C3 illustration: does the person's "yes" decide? | Whether C3's asset prompt keeps the model's "no image" option. Today C3 declares 0–1 images and the runtime honours the prompt | Model may decline |
| D4 Repo administration and ADR-log rules | Running `pnpm verify` in CI (Actions minutes, branch protection; pinned Node 24.13.1 and pnpm 11.12.0, Chromium and the Temporal CLI provisioned, the never-exercised POSIX paths), and the ADR-log rules (structured Changes/Later-records relations, CR14 enforced against git history, an ADR-0041 note). Until then the "CI check" statements in spec §4/§6, ADR-0059, CR14 and ADR-0068's merge gate are kept by hand: run `pnpm verify` before merging | Local `pnpm verify` only |

## Before any distribution

Applies to a packaged build or the replication kit (R2). Verified facts: `@img/sharp-win32-x64` 0.35.5 (Apache-2.0 AND LGPL-3.0-or-later) is only next@16.3.8's lazily loaded optional image optimizer; byway never imports next/image, and sharp's binary bundles LGPL and MPL-1.1 libraries. `lightningcss` and `lightningcss-win32-x64-msvc` 1.33.0 (MPL-2.0) are dev-only (through vitest and vite). `caniuse-lite` (CC-BY-4.0) is a production dependency that needs attribution. The Temporal CLI and Playwright's Chromium are downloaded at runtime and carry their own licences. `unionfs` 4.6.0 has no licence field but ships an Unlicense LICENSE file. The root package.json says Apache-2.0 but there is no LICENSE file (the owner's call). Required step: the distribution job generates a licence and notice manifest from the actual artifact, not from npm metadata alone.

## Before the study registry's first entry

Research prerequisites (RS). `labelFor` enforces `expires`, with an outcome the verdict union can represent (for example Historical). `StudyEntry` gets the CR11 scope tuple (ruleset, model profile, checkpoint binding, domain/task, outcome, rater population; ADR-0054). Labels key on the ADR-0041 frozen snapshot (recipe, prompt template versions, models, engine, renderer, fallback policy), not on the recipe hash alone. The lineage check must not trust an `exposure.jsonl` restored from an older backup; it cross-checks against the ledger's judging calls. The review's other activation prerequisites (treatment-fidelity dry run, instrument separation, operational governance, independent metric validation) restate ADR-0041/0044/0052/0054/0055 and apply before confirmatory collection.

## Deferred decisions (non-code)

| Decision | Default until decided | Deadline |
|---|---|---|
| D1 Baseline set | Recommended: B-Skill + B-Outside + B-BoN, gated behind H1a. The harness supports every arm either way. | Before Stage 0 |
| D4 Registered Report venue | PLOS ONE if it accepts sealed pre-acceptance generation; otherwise RSOS; stop if neither does | October 2026 |
| D7 Monitor, deputy, guarantor | Three different people | Before any pilot spend |
| D8 Ethics route and rater population | Academic co-investigator's IRB; US and UK raters; disclose AI-generated pages; corporate Prolific account unless an institution pays | Before any rating |
| D9 Funding, patents, legal entity | — | Before Stage 0 |
| D10 Ratifications and charter interpretations | — | Before Stage 0 |
| D13 Spending ceiling | — | After the cost probe and quotes |
| D24 Product consequences ("Worse" rows) | Draft table in protocol v1.1 | Before Stage 1 |
| SEED string source in the product | Runner-injected (crypto.randomBytes, model-step.ts defaultSeed), which is SSoT v3 App. D.6's "Seed Injection" form; D.6 found model-written strings generally scored higher on DeepSeek-R1-0528 / NoveltyBench Curated. The alternative is a model-written string. No behaviour or recipe-hash change until decided (cited by spec §3.3) | Before SEED is studied or claimed |
