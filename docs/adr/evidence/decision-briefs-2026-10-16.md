# Decision briefs of 2026-10-16 (D1 to D4 and the held questions)

On 2026-10-16 the owner asked, of the parts awaiting a decision, what exactly is to be done, the options with their pros and cons, and Claude's recommendations and why. Claude's analysis agents wrote one brief per decision, and a separate skeptic agent checked each brief: whether its recommendation holds, its weaknesses and factual errors, the options it missed, and a revised recommendation. Claude then put the briefs to the owner in chat. The owner's replies are in [conversation-continued.md](conversation-continued.md) (2026-10-16 09:17, 19:53 and 20:17, and 2026-10-17 08:24).

This file is the text of those briefs and skeptics as they were written, from `owner-decisions.json` (entries `analyse:D1` to `analyse:D4`, `analyse:NEW`, and the matching `challenge:` entries), which was kept only under `C:/Users/arvik/AppData/Local/Temp/byway-fixes/designs/`. The words are unchanged but for one redaction: on 2026-10-21, at the owner's request (the owner's words are in [conversation-continued.md](conversation-continued.md), 2026-10-21 13:41), Claude replaced in the D4 brief and its skeptic the names of the owner's other repositories with "[another repository]", and their Actions minutes, the organisation's September overage, its GitHub plan's name, seat count and price, and the plan's included minutes and their dollar value with "[redacted]". byway's own CI estimates (minutes and dollars per run and per month, and byway's share of the included minutes), on which D4 was decided, are as written. Claude added the headings and, in italics under each title, where the decision was made. A `<` that GitHub would read as the start of an HTML tag is written `&lt;`, so that it shows. The file's eleventh entry, a review of another session's branch for a flaky ledger test (`review:flaky-branch`), is not a decision brief and is left out.

The briefs describe the code as it stood on 2026-10-16, and their file and line references are to that day's code. Some of what they say was later found wrong, by the skeptics below or by the checks the ADRs record.

The probes the briefs and skeptics ran are in [probes/decisions/](probes/decisions/), copied unchanged:

- `D2-renderer-sandbox/`: the D2 brief's probes on this Windows machine. `probe.mts` launches the renderer's Chromium with the sandbox off and on, times it, and lists its processes with their integrity levels (`integrity.ps1`), in `probe-results.json`; `probe-fail.mts`, the first line Playwright gives and what byway said for three kinds of failed launch; `probe-timing.mts`, the time to draw and to read a page with the sandbox off and on; `wsl-check.sh`, what this machine's WSL Ubuntu offers the Linux sandbox.
- `D2-skeptic/`: `probe-ready.mts`, the skeptic's check of whether the renderer's readiness check starts a page renderer process or only the browser: it counts Chromium's child processes by type after the check and after one page (`probe-ready-results.json`).
- `D4-repo-admin/`: `cr14-probe.mjs` and `cr14-probe-mainline.mjs`, which count the Accepted records whose Context or Decision changed after acceptance (`.out` files: 13 on every commit, 1 on main's first-parent line); `changed-by-count.mjs` and `ff-check.mjs`; `time-gate.sh` and its `timings.txt`, the time each step of `pnpm verify` took. Its logs, and the two files its reads of GitHub saved (`github-actions-usage.txt` and `github-repo-state.txt`, on the organisation's Actions usage and billing and the repository's settings), are not copied: they name the owner's other repositories and the organisation's billing, which the D4 brief below quotes and this file redacts.

The held questions' skeptic also ran byway's own cost estimate for C1 and C2 runs, in demo mode with no calls made (`scratch/decisions/skeptic-new/`). It is not copied, because it holds key-shaped test strings; its result (a C1 run on Balanced at $1.14 to $5.87) is in the skeptic's text below.

## D1: refusal fallbacks

*Claude's note: where it was decided, [ADR-0102](../0102-one-refusal-rule-for-every-provider.md). The owner asked why the brief is only about Anthropic (2026-10-16 09:17), then chose Claude's later recommendation 2b (2026-10-16 19:53). The owner's words are in [conversation-continued.md](conversation-continued.md).*

### The brief

**Decision.** D1: Anthropic server-side refusal fallbacks (finding F04, cluster B). This is the one fix from the external review that still waits on you.

**Question.** When Anthropic's safety filter declines a Claude call, should byway let Anthropic retry it on a backup Claude model inside the same request, and if so where (product, study engine, or both) and with what guard on the budget?

#### Today

Fallbacks are ON for every direct Claude call, and budgets reserve only one attempt.

How a call is sent:
- The Anthropic adapter adds the beta header server-side-fallback-2026-07-01 and fallbacks: "default" to every request by default (packages/gateway/src/providers/anthropic.ts:41-51, 73, 123).
- The gateway option GatewayOptions.anthropicRefusalFallback defaults to true (packages/gateway/src/gateway.ts:90-95, 627).
- Neither production root sets it: apps/web/src/services/create.ts:66 and scripts/serve.ts:159.
- The OpenRouter profile is unaffected, because it is pinned with allow_fallbacks false.

What happens when the filter says no (a "refusal"):
- Anthropic re-runs the request on a backup model it picks by refusal category. Sonnet 5.5 goes to Sonnet 5, and only for cyber and frontier_llm declines. Opus 5.5 goes to Opus 5 or Opus 4.8, and never for reasoning_extraction. Fable 5.1 goes to Opus 4.8 or Opus 5, by routing Anthropic does not publish, and some categories have no backup.
- "Sticky routing": for about an hour afterwards, requests with the same content go straight to the backup model, with no refusal in that call.

How it is paid for:
- Admission reserves one attempt on the requested model: the estimated input plus the full output allowance, at that model's price (gateway.ts:224-228, estimate.ts:68-70). This goes through the spend book (ADR-0095).
- Settlement prices every attempt that was billed at the served model's own price (anthropic.ts:92-110, gateway.ts:729-743, prices.ts:151-165).
- claude-sonnet-5 has no price row, so its calls settle at Sonnet 5.5's rates, flagged 'assumed'. The rates are the same (prices.ts:47-50; backlog row 60).
- So one rescued call can settle above its reservation. Worst case is about 2x on Sonnet 5.5, 2.25x on Opus 5.5 and 1.5x on Fable 5.1. The book records the true cost, and later calls are refused against it (ADR-0091 decision 7, ADR-0095 decision 10).
- The final re-check on main at 1ba72f5 reproduced this: a routed refusal settled at $0.025009 under a $0.023 cap.
- The screens and the README already say "a single call can cost twice its estimate or more" (RecommendationView.tsx:510, SettingsView.tsx:188, README.md:37). apps/web/test/guard-estimates.test.ts pins that wording.

When a decline is not rescued:
- The gateway throws a non-retryable 'refused' error naming the category (gateway.ts:281).
- The runner records step-failed and the whole run ends (packages/runner/src/workflow/interpreter.ts:233-238).
- On the Recommendation screen, the person sees "The model declined to answer this request…" (apps/web/src/server/model-errors.ts:51-52).
- Paid answers are remembered per run (memo.ts MemoScope.runId). A new run therefore pays again for the earlier steps.

Which model answered is recorded only in the ledger. The runner never reads it and no screen shows it.

Research side:
- The Study 1 protocol says "server-side fallbacks are off" (docs/study1/protocol-v1.1-draft.md:437).
- The gateway must halt the run if the returned model differs from the profile (line 436, and §637).
- A refusal gets one logged retry, then counts as a Class Q "provider refusal" (line 473).
- No study engine root exists yet. The backlog's research prerequisites list "fallback policy" as part of the frozen study snapshot that labels key on (backlog.md:149).

No ADR decides the setting. ADR-0091 and ADR-0095 only say "unchanged, pending D1". The verification report's proposed "ADR-0081" number has since gone to the VOICE ADR, so the next free number is 0101.

What exactly is to be done: choose the policy (on, off, or split by product versus study), and whether budgets should reserve for the backup attempt. Then:
- record the choice in ADR-0101;
- make the small code and copy change that matches it;
- close backlog row D1 and the F04 line on the status page.

#### Why it matters

Three things meet in this one setting.

1. **Your budgets.**
- With fallbacks on, one call can cost up to about 2.25 times what the budget check reserved. With the price table and byway's own output limits (builders 16,000 tokens, re-asked up to 64,000 tokens, call.ts:38-39 and 83; judges 4,000, model-step.ts:28), assuming 10,000 input tokens:
  - A 16k Sonnet 5.5 build reserved at $0.18 can settle at up to $0.36.
  - A 16k Opus 5.5 build reserved at $0.36 can settle at up to $0.81.
  - A 64k Opus 5.5 re-ask reserved at $1.32 can settle at up to $2.97.
  - A 4k Fable 5.1 judge with 20,000 input tokens reserved at $0.40 can settle at up to $0.60.
  - A 4k Opus 5.5 judge reserved at $0.16 can settle at up to $0.36.
- Those figures are worst cases: the decline comes at the very end of a long answer. A decline before any output costs about one backup attempt: roughly 1.0x on Sonnet 5.5, 1.25x on Opus 5.5 and 0.5x on Fable 5.1, plus whatever Anthropic bills for the declined attempt, which depends on the category.
- A sticky-routed Opus 5.5 call costs 1.25x with no refusal at all.
- The overrun is limited to calls already running. It is recorded, and the next call is refused.

2. **The research program.**
- The study engine is this same engine. The protocol requires fallbacks off, and its model check would halt a study run and open a deviation if a backup model ever answered.
- Research credibility comes first (ADR-0043). So whatever the product does, a study must not be able to inherit rescue by accident.

3. **The person's runs.**
- With fallbacks off, a false positive becomes a failed run. A false positive here means Anthropic's filter wrongly declining harmless work; Anthropic says this happens "occasionally" near security and life-sciences topics.
- After a failed run, earlier spend is sunk. A new run pays again and asks the person's questions again, and the same brief may be declined again.
- Anthropic's guidance is to opt in "so that a false positive does not become an outage."

How often false positives happen cannot be measured here:
- There is no live ledger on this machine (%LOCALAPPDATA%\byway does not exist).
- The repository has no records of live runs.
- Anthropic publishes no rate in the material available.

#### Options

##### 1. Keep as today: on everywhere, one attempt reserved

Every Claude call keeps the backup retry. Budgets reserve one attempt.

What the person sees in practice:
- A false positive in a rescued category is answered by an older Claude model (for example Opus 4.8 instead of Fable 5.1), and the run continues. Nothing on screen says so.
- That call can settle at up to about 2x (Sonnet 5.5), 2.25x (Opus 5.5) or 1.5x (Fable 5.1) its reservation. The spend book records it and stops the next call if a budget is passed. The screens already warn about this.
- A future study root would have to remember to switch fallbacks off.

Pros:

- No code work.
- Keeps the rescue Anthropic recommends.
- The overrun is bounded to calls in flight, recorded at its true cost, and disclosed on screen.
- Reservations stay the same size, so as many calls run at once as today.

Cons:

- The shared engine's default contradicts the research protocol. A study root built later that forgets the flag would, on a refusal, be answered by another model; the protocol's model check would then halt the run and open a deviation. The default favours the product over research (ADR-0043).
- Sticky routing: for about an hour, repeat calls with the same content go to the backup model without asking. On Opus 5.5 that costs 1.25x.
- The model swap is silent: no screen shows which model answered.
- The F04 overrun stays open for the product.

Work: XS, documents only:
- ADR-0101 recording the choice. Today no ADR decides it; ADR-0091 and ADR-0095 say pending.
- A claude-sonnet-5 price row in packages/gateway/src/prices.ts, from Anthropic's published prices (backlog row 60).
- Close the D1 row in docs/backlog.md and the F04 line in docs/reviews/2026-10-16-review-fix-status.md.
- Add a Stage 0 prerequisite that the study root turns fallbacks off.

##### 2. Off everywhere (the verification's recommendation)

No Claude request asks for a backup. A decline fails plainly and names its category, for example "anthropic declined (cyber)".

What the person sees in practice:
- The run stops. To finish, they rephrase and start a new run, which pays again for earlier steps and asks their questions again.
- Budgets become near-exact. Output is capped by the token limit, and only the input estimate (a small share of most calls' cost) can be off.
- The study engine meets the protocol by default.

Pros:

- Matches the protocol (§5.1) with nothing to remember.
- One rule for the product and the study.
- Budgets hold within the input-estimate error, so the "twice its estimate" warning can be softened.
- No sticky routing. The model that answers is always the one the person chose.
- No price row to maintain.
- Product and study agree on fallback policy, which the planned evidence labels key on (backlog.md:149).

Cons:

- A false positive becomes a failed run: sunk spend, the person's questions to answer again, and possibly the same decline on the same brief (for example a security or biotech page).
- Departs from Anthropic's explicit recommendation to opt in from day one.
- The money the person loses on such an event (a whole run) is likely more than the overrun it prevents (one call).

Work: S, a few hours. No migration and no workflow or replay change.
- packages/gateway/src/providers/anthropic.ts: default off, or remove the option.
- gateway.ts: remove GatewayOptions.anthropicRefusalFallback, its comment and the line-627 default.
- Update the comment at prices.ts:47-50.
- packages/gateway/test/providers.test.ts:76-77 and 146-148, plus a test that no composed request carries the fallbacks field or its beta header.
- Revisit the copy, as ADR-0091 decision 4 asks: RecommendationView.tsx:510, SettingsView.tsx:188, README.md:37, and the OVERRUN constant in apps/web/test/guard-estimates.test.ts.
- The comment at packages/contracts/src/spend.ts:164-168.
- ADR-0101, with the way back.
- Close backlog row 60 and the D1 row, and update the status page.

##### 3. On, but reserve the backup's worst case before each call

Rescue stays. Each Claude call holds the declined attempt plus the dearest backup while it runs: 2x for Sonnet 5.5, 2.25x for Opus 5.5, 1.5x for Fable 5.1.

What the person sees in practice:
- Budgets hold even when a fallback happens.
- Every call ties up 1.5 to 2.25 times its estimate while running, so fewer calls fit under a budget at once.
- Parallel stages hit "Raise the budget by $X?" sooner, for money that is almost never spent.
- The verification measured that C2's 12-seed stage at its suggested $1.50 budget admits 9 seeds at once. At about double the hold, it would admit about 4.

Pros:

- Keeps the rescue.
- Budgets hold apart from estimate error.
- No new way for a run to fail.

Cons:

- Every run pays a concurrency and budget-question cost for a rare event.
- byway must own a table of backup routes and prices. Anthropic advises against this; routing for Fable 5.1 is unpublished; the table goes stale silently if Anthropic changes routing.
- The verification already rejected this design: plan-sized reservations crowd parallel stages.
- Still silent about which model answered.

Work: S to M, plus ongoing upkeep.
- A per-model multiplier or backup-price table used in admit (gateway.ts:684-713) and in retainBeforeResend (gateway.ts:720-722).
- The claude-sonnet-5 price row.
- Tests, including C2 concurrency.
- A check of the advisor's suggested budgets.
- ADR-0101.
- The table must be kept current by hand.

##### 4. On for the product, off for the study engine

The engine's default flips to OFF, which is the protocol's setting. The two product entry points (the web services and the worker) turn rescue ON explicitly. The study engine, when it is built, gets the default OFF, pinned in its hashed model profile (the "route" in ADR-0059) and its frozen snapshot, together with the protocol's served-model check.

What the person sees in practice:
- In the product, nothing changes from today: a false positive is rescued and the run continues, and one call can cost up to about 2.25x, recorded and disclosed.
- In a study, there is no fallback. A refusal gets the protocol's one logged retry, then counts as a Class Q failure.

Pros:

- Keeps rescue where a person is waiting on the run.
- Research is protected by system enforcement, not memory: any root that says nothing gets protocol behaviour (ADR-0043).
- Uses the option that already exists. No routing table.
- Reservations stay the same size, so there is no concurrency cost.
- Fits ADR-0041: the product may differ from pinned study versions.
- Study requests carry no fallbacks, so Anthropic's sticky record (organisation-wide) cannot touch them.

Cons:

- The product keeps F04's per-call overrun: up to about 2.25x of one call, bounded to calls in flight, recorded, and then stopped.
- Two policies in one engine to document and test.
- Product runs differ from the studied condition on this one setting. When the first study verdict enters the registry, the label rule must decide whether rescue matters, or run labelled recipes with rescue off.
- Still silent about which model answered unless a small "answered by" note is added later.
- Departs from the verification's recommendation.

Work: S, an hour or two plus tests.
- Default false at anthropic.ts:123 and gateway.ts:627.
- Pass anthropicRefusalFallback: true at apps/web/src/services/create.ts:66 and scripts/serve.ts:159.
- A composition test (scripts/test/composition.test.ts) asserting each root states its policy.
- Flip packages/gateway/test/providers.test.ts:76-77.
- Add the claude-sonnet-5 price row (backlog row 60).
- ADR-0101.
- Backlog under research prerequisites: the study model profile pins fallbacks off and builds the served-model check (protocol lines 436-437).
- Close the D1 row and update the status page.
- No copy change.
- Optional backlog row: show "answered by &lt;model>" when it differs from the model asked for.

##### 5. On, and check the budget again when Anthropic switches models

This is the "way back" the verification recorded. byway watches the response as it streams in. When Anthropic switches to a backup model (the first message names another model, or a fallback marker arrives), the gateway admits the backup attempt in the spend book at that model's own price. If the backup does not fit the budget, byway stops the call.

What the person sees in practice:
- Rescue happens when the budget has room.
- When it does not, the call stops: a budget question or a plain stop.

Pros:

- Rescue and budgets both hold at the moment of the switch.
- No up-front concurrency cost.
- No routing table: the price comes from the served model's own row.

Cons:

- Medium effort for a rare event.
- A decline in the middle of the stream is only fully priced at the end, and stopping still pays for whatever already streamed.
- More moving parts in the most money-critical path.

Work: M:
- Replace finalMessage() in anthropic.ts with stream-event handling, plus a switch hook in providers/types.ts.
- A mid-call top-up path in PaidCalls and the SpendBook for both the run cap and the workspace cap (a contracts change in packages/contracts/src/spend.ts).
- Fake-stream tests.
- The claude-sonnet-5 price row.
- ADR-0101.

#### Recommendation

Option 4: keep rescue on for the product and make it off for the study engine.

1. Flip the engine's default to off. The product's two entry points (create.ts and serve.ts) turn it on explicitly, and a composition test checks that each entry point states its policy.
2. The study engine's pinned model profile records "fallbacks off". The study engine adds the protocol's check that the answering model is the one asked for.
3. Add the claude-sonnet-5 price row, write ADR-0101, and close D1.

If you would rather have one rule everywhere and accept that a rare false positive stops a run, choose option 2. It is the clean alternative and equally small. I would not choose options 3 or 5: each is heavy machinery for a rare event.

#### Rationale

**Research first.** The study must run with fallbacks off. The protocol says so, and its model check would halt a run otherwise. The real research risk is not the product's setting. It is a study inheriting rescue from the shared engine by accident. Option 4 removes that risk by enforcement: any entry point that says nothing gets the protocol's behaviour, and the study's hashed profile pins it. That is the kind of safeguard ADR-0043 asks for. Option 1 leaves the risk in place.

**The person's money and time.** Options 2 and 4 differ only on one rare event: a false positive in a category Anthropic can rescue.
- With rescue, that event costs at most about one extra call: $0.18 on a 16k Sonnet 5.5 build, $0.45 on a 16k Opus 5.5 build, $1.65 at the 64k re-ask ceiling, usually less. The spend book records it, the next call stops, and the screens already warn about it.
- Without rescue, the run ends. Its spend is sunk, the person answers their questions again in a new run, and the same brief may be declined again.
- So rescue usually costs the person less, not more.

**What changed since the verification recommended "off everywhere".** It was written at b33f128, before the spend book (ADR-0095 and ADR-0099) and before the honest budget wording (ADR-0091). The overrun is now recorded and stops further spending.
- Its three reasons were: budgets that hold without halving concurrency, one engine for both, and no routing table owned by byway.
- Option 4 keeps concurrency and the single engine with a pinned setting, and needs no table. It gives up only exact budgets in the product, for a rare and bounded overrun.

**Proportion.** Option 4 is small (S) and reuses an option that already exists. Option 3 charges every run a concurrency and budget-question cost and needs a routing table Anthropic advises against. Option 5 adds streaming machinery to the money path.

**Honest limits.**
- How often false positives happen cannot be measured here. If they turn out to be frequent, or an overrun ever surprises you, revisit this decision; a small "answered by" note would make fallbacks visible.
- Option 4 leaves one later question. When a study verdict first enters the registry, decide whether rescue counts as a material difference for that recipe's label (backlog.md:149 already lists fallback policy in the snapshot).

#### Evidence

All read-only from C:/Users/arvik/code/byway/.claude/worktrees/wf_6371d503-2fc-2 at 07d428e (the same commit as main). I ran nothing in the repository.

**Gateway code**
- packages/gateway/src/providers/anthropic.ts:41-51, 58-75, 92-120, 122-131.
- packages/gateway/src/gateway.ts:90-95, 224-228, 281, 627, 684-713, 720-722, 729-743.
- packages/gateway/src/prices.ts:41-52 (Sonnet 5.5 $2/$10; Opus 5.5 $4/$20; Fable 5.1 $10/$50; Opus 5 and Opus 4.8 $5/$25; no claude-sonnet-5 row), 151-165.
- packages/gateway/src/estimate.ts:5-17, 68-70.
- packages/contracts/src/spend.ts:164-172.

**Runner and web**
- packages/runner/src/activities/call.ts:38-39, 83.
- packages/runner/src/activities/model-step.ts:28.
- packages/runner/src/workflow/interpreter.ts:219-238.
- packages/runner/src/activities/memo.ts:1-6, 29-33.
- apps/web/src/server/model-errors.ts:51-52.
- RecommendationView.tsx:510, SettingsView.tsx:188, README.md:37 and apps/web/test/guard-estimates.test.ts.
- Gateway roots: apps/web/src/services/create.ts:66 and scripts/serve.ts:159.
- A search for servedModel in apps/web/src and packages/runner/src found nothing.

**Records and protocol**
- ADR-0091 decisions 4 and 7, and its Consequences.
- ADR-0095 decision 10.
- ADR-0099 context.
- ADR-0041, ADR-0043, ADR-0059 (model profile "route"), ADR-0038.
- docs/study1/protocol-v1.1-draft.md:432-438, 473, 637.
- docs/backlog.md:60, 138, 149.
- docs/reviews/2026-10-08-external-review-verification.md: verdict table row F04, §4 item 1, cluster B appendix (F04 rationale lines 657-702, option C, step 3, notDoing at line 1139, final-check corrections at lines 1208-1221).
- docs/reviews/2026-10-16-review-fix-status.md, row F04.
- The adjudicated design C:/Users/arvik/AppData/Local/Temp/byway-fixes/designs/cluster-B.json (options[2].cons[3]; verifierEvidence probe cases A/B: $0.025009 settled under a $0.023 cap with fallback on, $0.02006 exactly at the reservation with it off).
- final-recheck.json, cluster B, F04: the overrun reproduced on main at 1ba72f5.

**Anthropic behaviour** (claude-api skill, shared/model-migration.md)
- Fallbacks trigger on policy declines only.
- A decline in mid-answer is billed at normal rates, and the backup is billed at its own rates. Whether a decline before any output is billed depends on its category.
- Sticky routing lasts about an hour, recorded organisation-wide by a hash of the content.
- Sonnet 5.5 retries only cyber and frontier_llm declines, on Sonnet 5.
- Opus 5.5 never retries reasoning_extraction; its backups are Opus 5 or Opus 4.8, with cyber going to Opus 4.8.
- Fable 5.1's routing is unpublished, and some categories have no backup.
- Opus 5.5 guidance: "Ship the opt-in from day one", so that a false positive does not become an outage.

**Not found**
- No live data directory at %LOCALAPPDATA%\byway.
- No records of live runs in the repository.
- So I have no data on how often refusals or false positives occur.

### The skeptic

**Does the recommendation hold?** Yes.

#### Weaknesses

- The 'answered by' note is listed as optional. It should be part of the change. Under option 4, a 'Best' run (its label promises 'Claude Fable 5.1 judges') can be judged by Opus 4.8 with nothing on screen saying so. ADR-0043 limits what product copy may claim. The fix is cheap: the gateway already returns servedModel to every caller (gateway.ts:292), and only the runner and screens ignore it (a search of packages/runner/src, apps/web/src and packages/advisor/src finds no use of it).
- The label question is put off until the first study verdict arrives. ADR-0043 asks for pre-commitment, and the rule can be fixed now at no cost, from data the ledger already holds: a product run counts as the studied condition on fallback policy only if every Claude call in it was answered by the model that was asked for (ledger servedModel equals requestedModel). Without this, backlog.md:149 as written ('labels key on ... fallback policy') means no product run with fallbacks on could ever carry a study label.
- 'Research is protected by system enforcement, not memory' is overstated. Flipping a default is a safe default, not enforcement: any root can still pass true. Real enforcement belongs in ADR-0101 as a Stage 0 requirement. The study gateway refuses fallbacks on any call tagged with a study or Program Registry ID (ADR-0059 already requires that tag), and it runs the protocol's served-model check.
- The research risk of option 1 is presented as larger than it is. The study engine needs a lot of new gateway work first: agent sessions with tools, per-arm keys and workspaces, registry IDs, and the served-model check (protocol §5.1-5.2; ADR-0059). Today's complete() path has none of these. If a study root ever forgot the flag, the required model check would halt the run and open a deviation. Nothing would be silently contaminated. Flipping the default is still worth doing because it is cheap and avoids that deviation. But it is not the decisive argument the rationale treats it as.
- The typical case is left out. Each reservation holds the call's whole output allowance, and most calls use far less. So a rescued call usually settles under its reservation anyway. An overrun needs three things together: a decline, output close to the limit, and admission close to the cap. This makes the product overrun rarer than the brief suggests, which supports option 4.
- Option 2's con 'the same brief may be declined again' leaves out that byway has OpenAI and Google profiles. A person with one of those keys can re-run the brief on another model family. The 'sunk spend' con also applies to option 4: Sonnet 5.5's bio, general_harms and reasoning_extraction declines and Opus 5.5's reasoning_extraction declines are never rescued, so those runs still fail.
- The run screen is not covered. A decline that is not rescued ends the run with the raw gateway text 'anthropic declined (cyber)' (interpreter.ts:845-851 passes it through unchanged). There is no plain explanation and no next step. The Recommendation-screen wording applies only to the advisor. Options 2 and 4 both leave this as it is.
- Option 3's con is overstated: 'byway must own a table of backup routes ... Anthropic advises against this'. A worst-case reservation needs only the price of the dearest allowed backup for each requested model, not the category routing. Opus 5 and Opus 4.8 both cost $5/$25, and Sonnet 5.5's only backup is Sonnet 5 at $2/$10. Anthropic's advice ('Prefer "default" over pinning a model') is about which backup the request names, not about budgeting with backup prices. Option 3 is still rightly rejected, because of the concurrency cost.
- The option 4 work list misses some items, so the effort is about half a day, not 'an hour or two'. The doc comments at anthropic.ts:49 and gateway.ts:90-95 still say the default is on. ADR-0091 (decisions 4 and 7) and ADR-0095 (decision 10) need 'changed by 0101' links in the ADR index. The claude-sonnet-5 price row needs sourced cache rates. create.ts needs a test of its own, because the existing composition test only reads serve.ts. ADR-0091 decision 4 also says the budget wording must be revisited once D1 is decided, so ADR-0101 should record that the revisit concluded 'keep the wording'.
- 'Pinned in its hashed model profile (the "route" in ADR-0059)' is not what option 4 builds. ModelProfile has no route or fallback field today (profiles.ts); the setting is an option passed when the gateway is created. That part is future study work and is not in the S estimate.
- The brief misses evidence that supports its own recommendation. byway ships a code recipe (C7 Lean Diff: implement, review and fix-defects prompts), and code work is where Anthropic says benign security requests 'occasionally' trip the classifiers. So rescue is worth more in the product than the verification's 'uncommon in this creative product' implies.
- ADR number 0101 may collide with the ADRs for D2-D4 being drafted at the same time. Allocate numbers in the order the ADRs land.

#### Factual errors

- There is no 64,000-token re-ask. askModel makes at most two attempts (call.ts:77, 'attempt < 2'). A 16k builder that is cut off is asked again at 32k. The 64k figure is computed after a second cut-off but never sent. No call site starts above 16k: builders and advisor compose use 16k; judges, asset briefs, lifecycle, relay and intake use 4k. The bullet 'A 64k Opus 5.5 re-ask reserved at $1.32 can settle at up to $2.97' should read: a 32k Opus 5.5 re-ask (10,000 input tokens) reserves $0.68 and can settle at up to $1.53. In the rationale, '$1.65 at the 64k re-ask ceiling' should be '$0.85 at the 32k re-ask'.
- The Opus 5.5 judge row ('reserved at $0.16 can settle at up to $0.36') assumes 20,000 input tokens, but the list says it assumes 10,000. At 10,000 input tokens the figures are $0.12 reserved and $0.27 worst case.
- Option 2's pro says 'only the input estimate (a small share of most calls' cost) can be off'. That holds for builders (about 11% of a 16k Sonnet 5.5 build), not for judges. A 4k judge with 10,000 to 20,000 input tokens plus images puts a third to a half of its reservation on input.
- 'Anthropic advises against this' (option 3) misstates the guidance. Anthropic advises against pinning fallback models in the request, not against knowing backup prices for budgeting (see weaknesses).

#### Missing options

- 2b. Off everywhere, plus the protocol's own refusal rule: one logged retry on the same model, then a plain failure (protocol-v1.1-draft.md:473). The retry is a new call through the spend book, so budgets stay exact. The model that answers is always the one chosen, there is no sticky routing, and product behaviour equals the studied condition, so backlog.md:149's labels work without a later ruling. It rescues some declines, probably mid-answer ones; a decline on the input itself will likely repeat. Effort S, in askModel or the gateway. The rescue rate is unknown. It is the stronger form of option 2, and it should replace option 2 as the 'one rule everywhere' alternative.
- Person-approved rescue, using the same pattern as the existing budget question (interpreter.ts askBudget). On a decline, the run pauses and asks: 'Anthropic declined this step (cyber). Retry it on Claude Opus 4.8 for about $X, or stop?' The retry is admitted at its own price, the swap is visible, budgets stay exact, and earlier spend is not lost. Effort M, and byway picks the backup from the published allowed_fallback_models. It is a better 'way back' than option 5, because it adds no streaming machinery to the money path.
- Tie the policy to the call or profile instead of the process root. For example, calls tagged with a study ID never carry fallbacks, or ModelProfile carries the route, as ADR-0059 describes the hashed profile (pinned IDs, route, effort). This still works if a study run is ever started from the same worker or web process as product runs, where a root-level switch could not tell them apart. Effort S-M. It can wait until the study gateway is built, but ADR-0101 should name it.
- Mitigations that apply under any option. Give unrescued declines a plain run-screen message that says what happened, that the call was billed, and what to do: rephrase, or re-run on the OpenAI or Google profile. Point people with legitimate security or life-sciences work to Anthropic's Cyber Verification and Life Sciences Verification programs, which reduce declines at the source.

#### Revised recommendation

Keep option 4 (rescue on in the product, off by default in the engine), with these amendments:

1. Flip the default to off at anthropic.ts:123 and gateway.ts:627, and fix their doc comments (anthropic.ts:49, gateway.ts:90-95). The web services (create.ts:66) and the worker (serve.ts:159) pass anthropicRefusalFallback: true. Test both roots.
2. In scope now, not optional: when a call's servedModel differs from the model asked for, the runner records it on the step, and the run screen says so ('answered by Claude Opus 4.8, Anthropic's backup after a decline'). The gateway already returns servedModel.
3. ADR-0101 fixes the label rule now (pre-commitment, ADR-0043). A product run counts as the studied condition on fallback policy only if every Claude call in it was answered by the model asked for. The ledger can already decide this.
4. ADR-0101 states the study requirement as enforcement, not a default. The study gateway refuses fallbacks on any study-tagged call, runs the served-model check, and gives a refusal one logged retry, as the protocol says.
5. Add the claude-sonnet-5 price row with sourced cache rates. Keep the 'twice its estimate or more' wording, and record that ADR-0091's revisit concluded 'keep'. Correct the overrun figures: the worst re-ask is 32k, so a rescue costs at most about $0.85 extra, not $1.65.
6. Give a decline that is not rescued a plain run-screen message: what happened, that it was billed, and what to do (rephrase, or re-run on the OpenAI or Google profile).

If the owner wants one rule for product and study, choose 'off everywhere plus the protocol's one logged retry' (2b), not plain option 2. Do not choose option 3 or option 5.

#### Reasoning

I checked every code claim against main at 07d428e (this worktree is at the same commit). Most of the description of today's behaviour is accurate:
- Fallbacks are on by default (anthropic.ts:73, 123; gateway.ts:627), and neither production root sets them (create.ts:66, serve.ts:159).
- Admission reserves one attempt (gateway.ts:224-228), and settlement prices each attempt at the model that served it (anthropic.ts:92-120; gateway.ts:729-743).
- claude-sonnet-5 has no price row (prices.ts:47-50).
- A refusal raises a non-retryable error (gateway.ts:281; GatewayError's retryable flag defaults to false), and the run then fails (interpreter.ts:233-238).
- Memos are kept per run.
- The budget wording is pinned by guard-estimates.test.ts.
- The Anthropic routing facts match the claude-api skill's model-migration.md: Sonnet 5.5 is rescued only for cyber and frontier_llm, Opus 5.5 never for reasoning_extraction, Fable 5.1's routing is unpublished, sticky routing applies only to requests that carry fallbacks, and the guidance is to 'ship the opt-in from day one'.
- The $0.025009-over-$0.023 reproduction is in cluster-B.json.

The main factual error is the 64k re-ask. askModel makes two attempts, so the largest call actually sent is 32k. That nearly halves the headline worst case: the extra cost of a rescue is about $0.85, not $1.65. Two smaller slips: the Opus judge row uses 20,000 input tokens, not 10,000, and 'input is a small share' is not true for judges.

Does the recommendation follow? Mostly yes. Options 2 and 4 both protect the study by default, so research credibility does not decide between them. What decides is the product trade:
- Rescue keeps a run alive on a rare false positive, as Anthropic recommends. The overrun is bounded, recorded and disclosed, and smaller than the brief says.
- Turning fallbacks off ends the run and loses its earlier spend.

byway's C7 code recipe makes cyber false positives more plausible than 'creative product' suggests. The typical rescued call probably settles under its reservation anyway. Both points favour rescue in the product.

The brief does get two things wrong that matter for the owner's research-first priority:
1. It treats the visible 'answered by' note as optional. That leaves a product honesty gap: the profile names one model and another answers, silently.
2. It puts off the label rule, even though backlog.md:149 already makes fallback policy part of what labels key on. Pre-committing a per-run rule that the ledger can already decide costs nothing now, and it is what ADR-0043's 'pre-commitment' asks for.

It also calls a default flip 'system enforcement'. Real enforcement is the study gateway refusing fallbacks on study-tagged calls, plus the served-model check. ADR-0101 should name both as Stage 0 requirements.

Finally, the brief misses option 2b: off everywhere plus the protocol's own one logged retry. It keeps one rule and exact budgets with some rescue, at size S. It is the right form of the 'one rule' alternative to offer the owner. A person-approved rescue (the budget-question pattern) is a better long-term way back than option 5, because it keeps streaming changes out of the money path.

I made no edits to the repository and ran nothing in it.

## D2: the renderer's OS sandbox

*Claude's note: where it was decided, [ADR-0105](../0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md). The owner did not accept the argument against an off switch (2026-10-16 09:17), and chose Claude's revised design, Windows and Linux only for now (2026-10-16 19:53). The owner's words are in [conversation-continued.md](conversation-continued.md).*

### The brief

**Decision.** D2: should the Chromium that byway uses to draw pages run inside Chromium's own OS sandbox? If yes, what should happen on a computer where that sandbox cannot start, and should there be an owner switch to turn it off?

**Question.** Do you switch on Chromium's OS sandbox for byway's page renderer, accepting that byway will not draw pages on computers where the sandbox cannot start, and do you want an explicit owner switch to turn it off?

#### Today

Main at 07d428e:
- **The setting.** packages/runner/src/pages.ts:278 has `RENDERER_OS_SANDBOX = false`. chromiumLaunchOptions() (pages.ts:286-288) returns headless, `chromiumSandbox: false`, the two WebRTC flags, and `env: withoutSecrets(env, namesFromEnvFile(env))`. Playwright 1.63.0 therefore adds `--no-sandbox` to every Chromium process (playwright-core lib/coreBundle.js:43346). Its own types say the option "Defaults to `false`".
- **What is already done (ADR-0084).**
  - One launch with no parameters: launchChromium(), pages.ts:2106.
  - No provider keys and nothing that looks secret in Chromium's environment. One known gap: started from a lowercase `c:\` folder, other names from .env.agents can still get through (README:136, ADR-0100).
  - A start-up check: checkRenderer(), pages.ts:2122.
  - Readiness before money is spent: lifecycle.ts:28 checks web-page runs, and model-step.ts:189 (rendererReady) checks runs that have 3 or more references including an image.
  - Any failure to start becomes one plain step failure that is not retried (launchFailure, pages.ts:299). It quotes Playwright's first line and the install command. There is no message specific to the sandbox.
- **What you see at start-up.** scripts/serve.ts:205 prints `renderer   Playwright's Chromium, ready (its OS sandbox is off; see Renderer in the README)`. scripts/e2e.ts:140-144 fails the end-to-end suite unless that line starts with "Playwright's Chromium, ready".
- **What runs in this Chromium.**
  - The pages a model writes, with their scripts. They may load any npm package from unpkg or jsDelivr.
  - Web-page examples given as HTML.
  - Lineup cards, which decode images people upload (checked only by their first bytes) and images providers return.
  - Since F07, VOICE's visitor read (shownText), which runs page scripts in the same Chromium (pages.ts header, lines 30-37; ADR-0081).
- **Tests.** packages/runner/test/launch.test.ts:89-92 pins the value at false. pages.test.ts:371-379 reads the real command line and compares it with a control launched with the other setting. So every test run on main already starts one Chromium with the sandbox on, on your machine.
- **Docs.** README.md:139 says the sandbox is off and the choice is open. ADR-0084 says the same under "What this does not decide", and docs/backlog.md:139 has the row "D2". The status page shows F18 as "Fixed, except D2".
- **Measured today on this machine.** All four Chromium processes (browser, GPU, network service, page renderer) run with `--no-sandbox` at Medium integrity, which is your own user's level.

#### Why it matters

The renderer is the one place byway runs content it did not write: model-written scripts, HTML examples, uploaded images and provider images. Your own web browser shows the same generated pages inside its sandbox. byway's renderer is the one place they run without one.

**With the sandbox off.** One Chromium, V8 or image-decoder bug lets that content run as you. That is not hard to come by: Playwright is pinned at 1.63.0, so its Chromium collects publicly known bugs over time, and the backlog has no bump policy yet. Code running as you can:
- read .env.agents. Stolen provider keys can be spent at the providers with no byway budget in the way. That is real money.
- change the spend book, the ledger and the artifacts in the data directory;
- read everything else in your account, including the research repo and its records.

ADR-0084 already removed the keys from Chromium's environment. That does not help here, because the file itself stays readable to anything running as you.

**With the sandbox on.** The process that runs page scripts and decodes images drops to Untrusted, the lowest Windows integrity level. Getting from there to your files needs a second, separate bug that breaks out of the sandbox.

**Cost on the Windows machines byway runs on today.** About nothing (measured below). The cost falls only on future Linux machines that block the sandbox, and on running as root or in a container.

#### Options

##### 1. Keep it off (status quo)

Nothing changes. byway keeps printing 'its OS sandbox is off' at start-up and draws pages on every computer: Windows, macOS, any Linux, as root or in a container.

Pros:

- No work, and no new way to fail
- Draws pages everywhere, including locked-down Linux machines and containers
- Already disclosed honestly: the start-up line, README.md:139 and ADR-0084

Cons:

- A hostile page or image plus one Chromium bug runs with your full rights: your keys file (uncapped spending at the providers), the spend book, and the rest of your account
- Gives up protection that costs nothing measurable on the machines in use (see Evidence)
- The P2 finding F18 stays half-fixed, and the risk grows with every month Playwright stays at 1.63.0
- Small inaccuracy left in place: README.md:139 and ADR-0084 say Ubuntu restricts user namespaces by default from 23.10. Ubuntu's notes say 23.10 introduced the restriction but did not turn it on by default; 24.04 is the first release that restricts them

Work: None. Optionally, one README sentence to fix the Ubuntu version (23.10 to 24.04).

##### 2. On, fail closed, plain message, no off switch (the verification's full recommendation)

Chromium always runs inside its sandbox. On Windows, which everyone uses today, the only visible change is the start-up line: 'inside its OS sandbox'.

On a computer where the sandbox cannot start, byway still starts, but:
- the renderer line says it cannot draw pages, with a plain message: the sandbox could not start, byway never draws without it, and the README says how to allow it for Playwright's Chromium alone;
- web-page runs, and runs with image examples, are refused before anything is spent;
- any other drawing fails with the same message;
- prose, options and code-diff runs without image examples work as before.

Such computers are native Ubuntu 24.04 or later without a per-program AppArmor rule, byway run as root, or a default Docker container.

Pros:

- Closes the rest of F18 with the smallest change: one configuration on every computer and no switch anyone can leave off by mistake
- Verified on this Windows machine: identical tiles and visitor reads, the same speed, and page scripts and image decoding still work
- Your test suite already starts a sandboxed Chromium on every run, so it has been working on your machine all along
- No workflow change, so no open runs are ended (pages.ts is not in the workflow bundle)
- Fits the research rule of one stated renderer setup that never varies silently by machine (ADR-0031, ADR-0084)

Cons:

- A future teammate on native Ubuntu 24.04 or later cannot draw pages until they add a per-program AppArmor rule, which needs admin rights once. That route is not tested here
- The rule names Playwright's Chromium by its file path, which changes with every Playwright upgrade. A wildcard path should cover this (untested)
- Running byway as root or in a container cannot draw pages at all
- The only way around it is editing the code. The start-up line would still show 'off', so even that would be visible
- Linux CI (decision D4) needs a runner where the sandbox can start. That is already true today, because the test control launches a sandboxed Chromium

Work: Half a day to a day.
- packages/runner/src/pages.ts: set the constant to true. Add sandboxFailure(): when Playwright's full error contains 'Chromium sandboxing failed!', give one plain, non-retried message that never suggests turning the sandbox off. Measured here: the error's first line is only 'Target page, context or browser has been closed', so today's message would wrongly blame a missing install.
- packages/runner/test/launch.test.ts: flip the pinned value. Add the failure mapping in the real error shape, a test that fails if a Playwright upgrade changes that text, and shownText on the every-path test.
- README Renderer section: a short Linux part (do not run as root or in a container; on Ubuntu 24.04 or later add a per-program AppArmor rule, marked untested); fix 23.10 to 24.04.
- Spec §3.2 render row, a new ADR extending ADR-0084, the ADR index, and closing backlog row D2.
- Add a backlog row: test the AppArmor steps on a real Ubuntu machine before Linux is announced.

##### 3. On, with an explicit owner off switch printed at every start

The same as option 2, plus one setting, for example `BYWAY_RENDERER_SANDBOX=off` in the shell or in .env.agents.

When it is set, byway draws without the sandbox and prints every start: `renderer   Playwright's Chromium, ready (OS sandbox OFF: BYWAY_RENDERER_SANDBOX=off)`. It never switches by itself, and the failure message does not advertise it; only the README mentions it.

Pros:

- Nobody is ever stuck: a Linux or container user has an approved, visible way out instead of a code edit
- The choice is explicit, shown at every start, and easy to undo
- Windows users get exactly what option 2 gives them

Cons:

- Brings the risk back through configuration. Once a setting exists it gets copied into setups and forgotten
- Builds for users who do not exist yet: everyone is on Windows, where it is never needed
- Adds a second launch setup to test and document, and loosens ADR-0084's 'one stated launch'

Work: Option 2's work plus about half a day (about one day in all):
- read the setting in chromiumLaunchOptions(), which already takes an env parameter;
- accept only on or off, and refuse to start on any other value;
- start-up line wording;
- tests for each value;
- README, and the ADR records the switch.

##### 4. On where it works, otherwise off with a warning (automatic fallback)

byway tries the sandbox. If it cannot start, byway quietly draws without it and prints a warning in the start-up output. Nobody is blocked, and nobody decides.

Pros:

- Never blocks anyone
- Windows and, presumably, macOS get the protection with no action from anyone

Cons:

- The machines that lose the protection are exactly the ones where nobody chose to: one easily missed start-up line stands in for a decision
- How pages are drawn then depends on the machine, without a recorded choice. The research side's rule is one stated, comparable renderer setup (ADR-0031, ADR-0084), and the verification explicitly ruled this out ('never automatic')
- Chromium is relaunched after a crash. Unless the result is fixed at start-up, a sandbox that fails only sometimes (reported on some container hosts) would switch the setting during a session
- The most code of the 'on' options: two launch paths, detection, pinning the result, and tests for each

Work: About 1 to 1.5 days: option 2's work, plus fallback detection in launchChromium() and checkRenderer(), keeping the start-up result for the whole session, two start-up line variants, and tests for both paths and for a relaunch.

#### Recommendation

Option 2. Switch the sandbox on, fail closed with a plain message, and add no off switch for now.

Also decide now, and write in the ADR, what an off switch would look like if one is ever added (option 3): explicit, printed at every start, never automatic, never suggested by the error message. Add it only when a real teammate's machine cannot start the sandbox and the README's Linux steps do not work for them.

Before Linux support is announced, test those AppArmor steps on a real Ubuntu 24.04 or later machine. WSL is not a valid test: it has no such restriction.

#### Rationale

**Safety and money.** The renderer is the only place byway runs code and image bytes it did not write. With the sandbox off, one Chromium bug puts that content next to your keys file, which means spending at the providers that byway's budgets cannot cap, and next to the spend book and the research files. With it on, the same content sits at Untrusted integrity and needs a second bug to get out. That is the protection your own browser already gives these pages.

**Cost today: about nothing.** Measured on this machine:
- Pages and visitor reads were byte-identical with the sandbox off and on: 10 drawings and 10 reads, one distinct result each.
- Speed did not change beyond normal variation: launch plus close took a median of 117 ms off and 111 ms on.
- Page scripts and image decoding work under the sandbox.

Your test suite has started a sandboxed Chromium on every run since F18 merged. Everyone runs Windows today, so nobody's day changes.

**Credibility first (ADR-0043).** Options 1 to 3 each keep one stated renderer setup that byway announces at start-up. Option 4 would let each machine silently pick its own setup, which goes against the research side's rule of one comparable, recorded renderer (ADR-0031, ADR-0084). That rules option 4 out. Switching the sandbox on changes nothing a reviewer sees, because the output is identical. It also stops a hostile page from reaching the account that holds the research records.

**Why no off switch yet.** Proportion and the small team. Nobody needs one today. Once a switch exists it tends to get set and forgotten, which quietly undoes the protection. If one is ever needed, adding it is half a day with its shape already agreed. The fail-closed cost lands only on future Linux machines, where the fix is a one-time admin step and not a code change.

**Not recommended either way.** Heavier isolation: a separate Windows account, or a container renderer. These need admin rights or Docker, contradict ADR-0067's Docker-free product, and add little for a local app run by a few people on their own machines.

**Why not keep it off.** The protection is free where byway runs, and the risk grows every month Playwright stays pinned.

#### Evidence

**Checked on this machine.** Windows 11 Home 10.0.26200, Playwright 1.63.0, chromium_headless_shell-1243, my worktree at main 07d428e. The repository was only read. Probe scripts and results are in C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/decisions/D2-renderer-sandbox/ (probe.mts, probe-results.json, probe-timing.mts, probe-timing-results.json, probe-fail.mts, probe-fail-results.json, integrity.ps1, wsl-check.sh). No Chromium was left running, and both checkouts are clean.

1. **Command line.** Main's launch options produce `--no-sandbox`, read through Chromium's own debugging interface (CDP). The same options with `chromiumSandbox: true` do not.
2. **Integrity levels** (Windows token query).
   - Sandbox off: browser, GPU, network service and page renderer all at Medium (0x2000), all with `--no-sandbox`.
   - Sandbox on: page renderer Untrusted (0x0000), GPU Low (0x1000), browser and network service still Medium (0x2000). This matches ADR-0084. The Medium network service is backlog row 53.
3. **Output.** Scripts ran under the sandbox (the page title a script set came back). The test page had scripts, a canvas, and a PNG and a JPEG decoded through the artifact route. Its 7 tiles across desktop, mobile and fold were byte-identical off and on, and so was the visitor read (shownText). The visitor read is new evidence: the earlier critic's checks came before F07. In a second run, 10 drawings and 10 reads, alternating off and on, gave one distinct tile set and one distinct read.
4. **Speed.** Launch plus close (5 each, warm): off 87-225 ms, median 117; on 97-118 ms, median 111. Warm three-surface drawing: median 553 ms off, 592 ms on. Visitor read: median 202 ms off, 136 ms on. All within normal variation.
5. **A computer whose sandbox cannot start, simulated.** Git's echo.exe stood in for Chromium and printed Chromium's 'No usable sandbox!' and run-as-root (crbug.com/638180) markers.
   - Playwright's error starts 'Target page, context or browser has been closed'. Further down it contains 'Chromium sandboxing failed!' and its advice to use `chromiumSandbox: false`.
   - Main's launchFailure() would print 'The page renderer could not start (Target page, context or browser has been closed)…', followed by the install hint. That message is misleading.
   - An unrelated failure does not contain the marker text. Switching on therefore needs the sandbox-specific mapping, keyed on the full error text and not its first line.
6. **The test suite already starts a sandboxed Chromium.** The control launch at pages.test.ts:373 does it on every run.
7. **Your WSL Ubuntu 26.04** (WSL2 kernel 6.18): Ubuntu's restriction setting does not exist there, and creating a user namespace without admin rights works. The sandbox should work there, but it was not launched: WSL has no Node or Chromium installed. For the same reason, WSL tells us nothing about native Ubuntu.

**Not checked here; from documentation only.**
- **Native Ubuntu.** The 24.04 release notes say the kernel now restricts unprivileged user namespaces; 23.10 introduced the restriction but not by default. Ready-made exceptions ship for Google Chrome at /opt/google/chrome, not for Playwright's downloaded Chromium.
  - https://documentation.ubuntu.com/release-notes/24.04/
  - https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces
  - The per-program AppArmor route is not tested.
- **Root and Docker.** Playwright's Docker page says running as root "will disable the Chromium sandbox", and that a seccomp profile is needed to run Chromium with the sandbox in a container (https://playwright.dev/docs/docker).
- **Windows design.** Chromium's design doc says the Windows sandbox is user-mode only, with no kernel drivers, and that "the user does not need to be an administrator" (https://chromium.googlesource.com/chromium/src/+/HEAD/docs/design/sandbox.md). Antivirus or company-policy edge cases were not tested. Per the verified design they would show up as a crash that is retried, never as a silent fallback.
- **Linux mechanism.** Chromium uses unprivileged user namespaces or a setuid helper, plus seccomp-bpf (https://chromium.googlesource.com/chromium/src/+/2f7dfeb1/docs/linux/sandboxing.md).
- **macOS.** Expected to work without admin rights; not tested.
- **No exploit was attempted.** The threat stays conditional, which is why it is P2.

**Repository sources.**
- docs/backlog.md:139 (D2), and rows 51-55 (CDN breadth, Playwright bump policy, Windows network service, runbook snippet).
- docs/reviews/2026-10-08-external-review-verification.md: verdict table line 45; §2 cluster H; §4 item 2; appendix lines 3820-4166, with options A-D, recommendation B and the final check's residuals.
- docs/reviews/2026-10-16-review-fix-status.md, row F18.
- C:/Users/arvik/AppData/Local/Temp/byway-fixes/designs/cluster-H.json and final-recheck-items.md (the F18 re-check notes).
- ADR-0084, ADR-0074, ADR-0031, ADR-0043, ADR-0067, ADR-0100 items 5-6.
- README.md:131-139; spec render row (line 72).

### The skeptic

**Does the recommendation hold?** Yes.

#### Weaknesses

- Option 2 promises that a computer that cannot sandbox is caught at start-up and before any money is spent. On main that is true only when Chromium fails as it launches. ready() (pages.ts:603-605) and checkRenderer() only call getBrowser(), and no page is ever opened. My probe showed that a launch on its own starts only the GPU and network-service processes, not the page renderer, with the sandbox on or off (C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/decisions/D2-skeptic/probe-ready.mts and probe-ready-results.json). The page renderer is the process the sandbox exists for. If it alone fails under the sandbox (security software or company policy on Windows; untested, as the brief admits), byway would still print 'ready (inside its OS sandbox)' and pass the web-page gate. The run would then fail at its first draw, after the paid build steps, with 'The page could not be drawn: the page renderer failed while drawing it (...)'. That message never mentions the sandbox.
- The research-credibility argument against option 4 contradicts the brief's own evidence. Tiles and visitor reads were byte-identical with the sandbox off and on, so the setting cannot make screenshots less comparable, which is ADR-0031's concern. Option 4 is still wrong, but for the safety reason the brief gives second: protection disappears silently on the machines where nobody chose that, and the verification's rule is 'never automatic'. Comparability is not a reason.
- The brief leaves out the strongest credibility argument. packages/gateway/src/ledger.ts:161-162 says the hash chain and head file only catch tampering by someone who does not also rewrite every later hash and the head, and that 'anchoring the head outside the data directory is future work'. With the sandbox off, a hostile page that exploits a Chromium bug runs as you. It can then rewrite the spend ledger, its head and the artifacts together, and nothing would detect it. That is a concrete ADR-0043 reason for option 2, much stronger than 'one stated renderer setup'.
- The likelihood is overstated. 'That is not hard to come by' is not supported. An attack needs a working exploit for this exact Chromium build. It must arrive either through model output (a prompt-injected page, or an npm package loaded from unpkg or jsDelivr) or through an image you upload yourself. For a local app used by a few people, a targeted attack is unlikely. The case for option 2 does not need a high likelihood: the impact is high and the cost is near zero. Saying it that way keeps the brief proportionate.
- Option 1's con 'uncapped spending at the providers' ignores the spending limits each provider lets you set in its own console. Setting them takes minutes, whatever D2 decides, and caps the money a stolen key can cost. They protect the money, not your files or research records.
- The brief does not tie D2 to the Playwright bump policy (backlog row 'Playwright bump policy'). While Chromium stays pinned, publicly known sandbox-escape bugs pile up as well as renderer bugs. The sandbox raises the bar from one bug to two, but both bars get lower over time. The research side's preference for a pinned renderer (ADR-0031) pulls against regular bumps, which makes the sandbox more valuable, not less. That tension should be stated.
- Credibility comes first, so the brief should say that D2 does not cover the research harness. Its own renderer snippet, protocol/06-runbook.md:39 `chromium.launch()`, uses Playwright's default and runs without the sandbox. A backlog row already exists. The owner should know that switching byway's renderer on does not change that.
- One gap in the evidence, now closed. The brief checked tiles, visitor reads and speed with the sandbox on, but did not run the real-Chromium test suite at 07d428e with the setting flipped. I did, in my own worktree, and restored it afterwards. pages, cards, page-arbiter, voice and launch tests: 188 of 189 passed. The only failure was the pin test, which is meant to flip. This supports option 2.
- The Linux CI point is right as far as it goes. But GitHub's hosted ubuntu-24.04 runners may have the restriction (I could not confirm it either way). On such a short-lived CI machine a one-line sysctl step would be acceptable, unlike on a teammate's laptop. This is worth noting for D4, not a blocker.

#### Factual errors

- The brief says that on Windows, antivirus or policy failures 'would show up as a crash that is retried'. That is out of date. It repeats the 2026-10-08 verification. Commit 755c114 (2026-10-09) added drawFailure and readFailure (pages.ts, after checkRenderer). Since then, a page or browser that closes or crashes during a draw or a visitor read becomes one plain StepError that is not retried. The 'never a silent fallback' part is still true.
- 'Runs with image examples are refused before anything is spent' is broader than the code. model-step.ts:189-197 checks the renderer only when a run has at least GREAT_MIN_REFERENCES = 3 examples and one of them is an image. Runs with one or two image examples form no cards and are not checked; they do not need the renderer.
- The before-spend refusal holds only for failures when Chromium launches. ready() never starts a page renderer: measured here, a launch on its own starts only the GPU and network-service processes. So a failure that only the sandboxed page renderer hits is not refused before money is spent. The brief implies that every machine that cannot sandbox is caught at start-up.

#### Missing options

- Option 2 plus a readiness check that starts a page renderer. checkRenderer(), and ready() whenever it launches a new browser, would open one blank page, run a one-line script, then close it. The sandboxed page renderer then really starts before the start-up line says 'ready' and before any paid step. A failure there gets a plain message that names the sandbox as one possible cause; out-of-memory is the other, as the verification notes. Cost: about 1 to 2 hours plus one test, and tens of milliseconds at start-up (launch only took 54 ms here).
- A variant of option 3: an off switch that cannot be stored. It would be a flag typed on `pnpm start` each time, never read from the shell environment or .env.agents, and printed at every start. This answers option 3's main con, a setting copied into a config and forgotten. It is still not needed today, but it is a better shape to write into the ADR than an environment variable.
- Provider-side spending limits, set by the owner in each provider's console. This adds to option 2 and does not replace it. Whatever D2 decides, it caps the money stolen keys can cost.
- Pair D2 with the Playwright bump cadence (the existing backlog row) as the next renderer item. Re-check the sandbox failure text on each bump, which the planned test that catches changes to that text supports.

#### Revised recommendation

Option 2 holds: switch the sandbox on, fail closed, and add no off switch for now. Amend it in five ways.

(1) The readiness check should open one blank page and run a script. That way the sandboxed page renderer starts before the start-up line says 'ready' and before any paid step. This adds about 1 to 2 hours, so option 2 is about one day in all.

(2) Correct the evidence. On main, a renderer crash is a plain failure that is not retried, not a retried crash.

(3) Reject option 4 for the safety reason: protection would disappear silently where nobody chose that. Do not reject it for comparability, since the output is byte-identical. Add the concrete credibility reason for option 2: code running as you can rewrite the spend ledger and its unanchored head without being detected (ledger.ts:161-162).

(4) Describe the threat as unlikely but serious, with protection that costs almost nothing. Do not say exploits are easy to come by.

(5) Schedule the Playwright bump policy as the next renderer item. Suggest provider-side spending limits as a five-minute owner step that helps whatever D2 decides.

If an off switch is ever written into the ADR, prefer a flag typed at each start over an environment variable or .env.agents entry.

#### Reasoning

I checked the brief against main 07d428e, worked read-only there and ran probes only in my own worktree. Most of the 'today' section is accurate:
- RENDERER_OS_SANDBOX = false at pages.ts:278, and chromiumLaunchOptions at 286-288.
- Playwright adds --no-sandbox unless chromiumSandbox is true (coreBundle.js:43346-43347), and its types say 'Defaults to `false`'.
- The start-up line at serve.ts:205 already prints 'inside its OS sandbox' when the constant is true, so option 2 needs no change there, and the e2e check (e2e.ts:140-144) still passes.
- The pin test is at launch.test.ts:89-92. The sandbox-on control launch at pages.test.ts:371-382 is in the default vitest run.
- pages.ts is not in the workflow bundle.
- The Ubuntu correction is right: the 24.04 release notes say 23.10 introduced the restriction 'where it was not enabled by default'.

**What I ran.**
- With the constant flipped in my worktree, then restored, all 188 real-Chromium tests in pages, cards, page-arbiter, voice and launch passed. Only the intended pin test failed. That supports option 2's 'free on Windows' claim at current main.
- A probe (scratch/decisions/D2-skeptic/probe-ready.mts) showed that a launch on its own, which is all ready() and checkRenderer() do, starts only the GPU and network-service processes, with the sandbox off or on. The page renderer starts only when a page opens. So option 2 catches launch-time failures (the Linux, root and container cases) at start-up and before spend. It does not catch a failure that only the sandboxed page renderer hits. Such a failure would surface after paid steps as drawFailure's message, which does not mention the sandbox, and it would not be retried. The brief's 'crash that is retried' comes from the 10-08 verification and was made stale by 755c114 on 10-09.
- Neither point overturns option 2. One makes it cheaper to trust (the tests pass). The other is a small, cheap gap to close in the same change.

**Where the reasoning slips.**
- It rules out option 4 on comparability grounds, yet its own byte-identical evidence shows the setting cannot affect comparability. The real reasons are safety and 'never automatic'.
- It misses the strongest credibility argument. The ledger's hash chain and head live together in the data directory and are not anchored elsewhere (ledger.ts:161-162), so anything running as the user can rewrite them undetected.
- 'Not hard to come by' overstates the likelihood. The proportionate framing is: unlikely, high impact, near-zero cost.
- It omits provider-side spending limits and the link to the Playwright bump policy.

**Effort.** The estimates look about right: option 2 half a day to a day, plus 1 to 2 hours for the readiness change. Option 3 adding about half a day and option 4 at 1 to 1.5 days are plausible.

**Clean-up.** My worktree was restored and is clean at 07d428e, and no Chromium process was left running.

## D3: the C3 illustration veto

*Claude's note: where it was decided, [ADR-0101](../0101-c3-yes-decides-the-header-image.md). The owner chose B+ (2026-10-16 09:17). The owner's words are in [conversation-continued.md](conversation-continued.md).*

### The brief

**Decision.** D3: the C3 illustration veto (finding F11, cluster F)

**Question.** When you say Yes to Series Writer's (C3) header-image step, should the AI still be allowed to answer "no image", or should your Yes decide?

#### Today

On main (07d428e):

1. The step. C3 (Series Writer) ends its Refine stage with an optional image step: packages/catalog/src/c3.ts:54, optional('asset-if-wanted', 'you want a header image (charts computed from real data are not made in this version)', asset(... { knobs: { slots: 1 } })).

2. Your question. The run stops and asks: "Run this step? It is meant for when you want a header image (charts computed from real data are not made in this version). Yes runs it; No skips it." (packages/runner/src/workflow/interpreter.ts:710-721, wording.ts:98-99). The current draft is attached to the question, so you see the piece when you answer (interpreter.ts:712, apps/web/src/components/run/panels/ConfirmPanel.tsx:24-29). No skips the step with "You chose not to run this step."

3. The AI's veto (its power to say no). After a Yes, the AI writes the image brief from packages/prompts/templates/product.c3.asset.md (version 2). Its front matter says `images: 0-1` (line 7). Line 25 says: "If the piece is better with no image at all, return an empty list." This line has been in the prompt since the first templates (ee86a5d, 2026-10-07). The protocol has no such line.

4. The runtime accepts an empty answer. packages/runner/src/activities/asset.ts:98-109 reads the 0-1 limit from the prompt. An empty list is not asked again. No image is made and no placing call is made. The piece is unchanged, and the step finishes as done (not "skipped") with this note (asset.ts:44): "The AI chose not to illustrate this piece, which its instructions allow, so no image was made; the work is unchanged." Only the brief call is paid, about 1-2 cents.

5. The copy mentions this in one place only: the recipe's "Custom imagery" explainer (packages/catalog/src/presentation.ts:205) says "If you want one, the AI makes a header image for the piece, unless it judges the piece better without one." The Yes/No question itself does not mention it.

6. Tests pin this behaviour: packages/runner/test/asset-slots.test.ts:313-331, packages/prompts/test/media-contracts.test.ts:20-24, and the e2e test at packages/runner/test/e2e/text-media.ts:246-264.

7. Records: ADR-0090 §2, "C3 keeps its 'no image' answer (owner decision pending)"; docs/backlog.md rows 84 and 140; the status page's F11 row, "Fixed, except D3".

8. Already fixed, whatever you decide: F11's real harm. An empty answer given twice used to fail the whole run late (ContractMissed). Now, when a prompt requires at least one image, an empty answer gets one more request ("Write at least one image brief."). If the second answer is empty too, the step is skipped with a note and the run continues (asset.ts:105-109, NO_BRIEF_NOTE). This is tested for C1 at asset-slots.test.ts:381-392.

#### Why it matters

The question is who decides. Money and safety barely change either way.

- You answer the image question with the draft in front of you. Today the AI can still overrule your Yes, and you find out only afterwards, from the step's note.
- A wrong "no image" cannot be undone inside the run. byway cannot re-run a single step. To get the header you would have to start a whole new C3 run (seeds, critic loop and the rest) or make the image outside byway.
- An unwanted image is easy to undo. In the Trim step that comes right after (D3), you list what the piece could lose and the AI removes it.
- The money is small either way. These figures are the advisor's typical-token estimates, not measurements:
  - Balanced profile: about 7 cents for the image step (one Gemini image at $0.0336, plus the brief call and the placing call).
  - Best profile: about 31 cents (gpt-image's planning bound is about $0.24 per image).
  - A "no image" answer costs about 1-2 cents.
- Nobody knows how often a model declines after a Yes. No live run has measured it, and the demo mock never declines.
- Deciding closes the last open part of F11. Until then the prompt, the explainer, spec §3.3 and three tests all describe the veto as "pending".

#### Options

##### A. Keep the AI's veto (today)

Nothing changes in how byway behaves. You say Yes. Usually the AI writes a brief and a header image is made and placed in the piece. Sometimes it returns no brief. Then you get no image and the note "The AI chose not to illustrate this piece…". To get an image at that point, you start a new run or make one elsewhere.

Pros:

- No code change: it is built and tested.
- The AI can spare a piece a generic, stock-looking header. The protocol made C3's image step optional because "real photos often beat generated ones" (protocol/03-configurations.md:320), and NN/g eye-tracking found that people ignore generic decorative images (protocol/SOURCES.md:255).
- Saves about 5-30 cents in the runs where the AI declines.
- Honest today: the recipe's explainer says the AI may decline.

Cons:

- The AI overrules a choice you made with the draft in view. The verification called the veto "the odd part" (verification line 38).
- The protocol has no such veto. 03 C3 runs the image step when its trigger fires, which is the person wanting a header. 01 ASSET is started by a person and removes weak images afterwards through CUT. The runbook's image prompt (06 §5) tells the agent to make images.
- The ASSET block exists partly because agents "underuse image tools they already have until told to use them" (01-blocks.md:290). The veto line invites exactly that.
- A wrong decline can only be fixed with a whole new run.
- The Yes/No question does not say the AI may still decline. Only the recipe explainer does.
- One product-only rule stays in a recipe that byway labels a protocol configuration.

Work: About an hour, docs only. Write a short ADR recording your decision: owner-decided, and it settles ADR-0090 §2's "pending" by addition. Add its "changed by" link in the ADR index. Close backlog rows 84 and 140, and set the status page's F11 row to Fixed. Optional: remove the "pending" wording from the prompt's source note (this bumps the template to v3) and from the test comments at media-contracts.test.ts:20 and asset-slots.test.ts:327.

##### B. Your Yes decides (C3 prompt v3: images 1-1, no veto line)

Yes means an image. The AI writes one brief, and byway makes the image and places it. If the AI still returns nothing, it is asked once more ("Write at least one image brief."). If it returns nothing again, the step shows as skipped with the note "The AI wrote no usable image brief, even when asked again, so no image was made; the work passes through unchanged." Either way the run continues. If you don't like the image, list it in the Trim step that follows and the AI removes it. If you don't want an image, answer No.

Pros:

- You decide, having seen the draft. The AI never overrules you.
- Matches the protocol: 03 C3 runs the image step when the person asks, 01 ASSET removes weak images afterwards (your Trim step), and the runbook (06 §5) gives a direct instruction to make images.
- No new machinery. The "at least one image" path is already built and tested for C1 (asset-slots.test.ts:368-392).
- c3's recipe hash does not change, because recipes/c3.json:265 names the prompt only by id. The run engine's code does not change either, so no runs waiting for you are ended (ADR-0078 does not apply).
- This is what the verification recommended and what the adjudicated cluster-F design specified: "product.c3.asset v2 declares 1-1 and has no veto line" (verification lines 3163 and 3247).
- Simpler copy: the explainer loses its "unless" clause, and Yes means what it says.

Cons:

- The AI can no longer spare a piece a generic header. That judgement is yours, at the question and again at Trim.
- An image you later trim was still paid for: about 5 cents (Balanced) to about 28 cents (Best) more than a decline would have cost.
- One extra brief call (about 1-2 cents) whenever the AI's first answer is empty.
- The prompt file's hash changes. The ledger records the new hash per call. C3 is in no study, so no research record is affected.

Work: Small: about half a day, including review and `pnpm verify`.
(1) product.c3.asset.md v3: set `images: 1-1`, delete line 25, say the writer asked for a header image, and update the source note.
(2) presentation.ts:205: drop "unless it judges the piece better without one".
(3) Tests: media-contracts.test.ts:20-24 expects {min:1,max:1}. asset-slots.test.ts:313-331 becomes "an empty answer is asked again; empty twice is skipped with NO_BRIEF_NOTE". The e2e test at text-media.ts:246-264 changes the same way.
(4) Spec §3.3 (docs/superpowers/specs/2026-10-07-product-v1-design.md:124): change 0-1 to 1-1 for C3.
(5) A short ADR recording your decision (it amends ADR-0090 §2 by addition), plus its ADR-index link.
(6) Close backlog rows 84 and 140, and set the status page's F11 row to Fixed.

##### C. The AI may decline, but must ask you first

If the AI thinks the piece is better without an image, the run pauses and asks: "The AI suggests no header image: &lt;its reason>. Make one anyway?" Yes makes one. No leaves it out.

Pros:

- The AI's taste becomes advice, and you keep the decision.
- You see its reason before anything is lost.

Cons:

- You are asked the same thing twice: you already said Yes with the draft in view.
- New machinery for a rare, unmeasured case. Only the run engine can open a question (interpreter.ts ask), not the image step, so the engine's code changes. Under ADR-0078, every run waiting for you when this ships ends and has to be started again.
- The brief's answer format needs a new reason field (packages/runner/src/parse.ts:179-181), and a second, forced brief call is needed after "make one anyway".
- More wording, more tests and more review, all for a step that costs cents.

Work: Medium: about 1-2 days, plus review rounds. Changes: parse.ts (the reason field), the runner types (a "declined" result), interpreter.ts (ask after the image step, then re-run it with an image required), wording.ts (the new question), a forced-brief template or knob, web copy, tests (activity, interpreter and e2e), an ADR, and spec and backlog updates.

##### D. You choose in advance whether the AI may decline

Two ways to do it. In the run: at the image question you answer twice in a row, first Yes or No, then "make one" or "let the AI decide". At Start: you answer once, before any draft exists. "Let the AI decide" behaves like today. "Make one" behaves like option B.

Pros:

- Each person sets their own rule.
- Asked in the run, it reuses the existing route mechanism (a route is a choice between branches), so the run engine's code does not change.

Cons:

- More questions, for a matter of 5-30 cents.
- At Start you have not seen the draft yet, so you decide with less information than today's question gives you.
- The recipe format cannot express an empty branch (a sequence needs at least one step: packages/recipe/src/schema.ts:170). So "No / make one / AI decides" has to be built as an optional step with a route inside it: two questions back to back.
- c3's recipe hash changes (recipes/c3.json must be regenerated; no study is registered, so no record is orphaned), and the step needs two templates, one 0-1 and one 1-1.
- Asking at Start also needs an advisor chooser question or a control on the Start screen, which means a contracts change.

Work: Asked in the run: small to medium, about a day (c3.ts, recipes/c3.json, a second template, route labels through routeChoice, the explainer, tests and an ADR). Asked at Start: medium, adding the advisor's chooser and the web Start screen.

##### E. Keep the veto, but say so at the question and show the AI's reason

Behaviour stays as today, with two additions. The Yes/No question warns that the AI may still decide against an image. If it does, the step's note gives its one-line reason.

Pros:

- Cheaper than C, and today's behaviour becomes visible at the moment you answer.
- The AI can still spare a piece a generic header.

Cons:

- There is still no way to get the image except a new run.
- The question's wording comes from the recipe's trigger (c3.ts:54), so c3's hash changes. The answer format also gains a reason field.
- The product still departs from the protocol.

Work: Small: about half a day. Change the trigger wording in c3.ts and regenerate recipes/c3.json. Write product.c3.asset v3, which asks for a one-line reason along with an empty list. Add an optional reason field in parse.ts and put the reason in asset.ts's note. Then tests, an ADR, the backlog and the status page.

#### Recommendation

Option B: your Yes decides. Change C3's image prompt to require exactly one image (images 1-1) and delete the "return an empty list" line. Drop the "unless it judges the piece better without one" clause from the explainer. Record the decision in a short ADR. If you would rather keep the AI's judgement, choose A, not C, D or E: A is honest today and costs nothing to keep.

#### Rationale

Your safety and money: nothing is at risk under any option. None of them touches keys, consent or stored data. The image step costs cents, and every paid call is still held to your workspace spend cap (the spend book, ADR-0095). B never fails a run: if the AI returns nothing twice, the step ends in an honest skip. F11's fix already built that path, and it is tested for C1.

Whose decision it is: byway is built on the person leading (VISION, VOICE). You answer the image question with the draft on screen. Letting the AI overrule you, with no way back short of a new run, puts it the wrong way round. A wrong image is cheap to undo in the Trim step. A wrong decline is not.

Research credibility comes first (ADR-0043), and no option affects any study. No study uses C3: STUDY_REGISTRY is empty (packages/advisor/src/registry.ts:23). Study 1's C1-H uses article.ASSET (1-3 images, no veto; recipes/c1h.json:144), which no option changes. B also brings C3 back in line with the protocol (03 C3, 01 ASSET, runbook §5), so byway's \"protocol configuration\" label stays accurate. A keeps a product-only rule in that recipe. The explainer discloses it, so it is not dishonest, but it is a gap between the product and the protocol.

Small team, local app: B is the smallest real change. It means two text edits, three test updates and a short ADR. There is no recipe hash change and no run-engine change, so no waiting runs are ended.

Proportion: C and D add questions, answer-format fields or run-engine changes for a case that is unmeasured, probably rare, and worth cents. E makes A more visible but leaves its real cost in place: no way back after a wrong decline.

Reversible: if live use shows people often trimming generic headers, add the AI's view back as advice later (C or E), with data to justify the extra machinery.

#### Evidence

All read-only on main 07d428e (worktree C:/Users/arvik/code/byway/.claude/worktrees/wf_6371d503-2fc-4). Nothing was edited, built or run.

- C:/Users/arvik/code/byway/packages/prompts/templates/product.c3.asset.md: line 7 `images: 0-1`; line 25 is the veto line. It has been present since v1 (git show ee86a5d); 9b8dd1c added the 0-1 declaration.
- C:/Users/arvik/code/byway/packages/catalog/src/c3.ts:54: the optional step and its trigger.
- C:/Users/arvik/code/byway/packages/runner/src/workflow/interpreter.ts:710-721 and wording.ts:98-99: the Yes/No question, with the draft attached. apps/web/src/components/run/panels/ConfirmPanel.tsx:24-29 shows the draft.
- C:/Users/arvik/code/byway/packages/runner/src/activities/asset.ts:42-44 and 98-109: NO_IMAGE_CHOSEN_NOTE versus NO_BRIEF_NOTE, and how an empty answer is handled. slot-plan.ts:101: "Write at least one image brief."
- C:/Users/arvik/code/byway/packages/catalog/src/presentation.ts:205: the explainer's \"unless\" clause.
- Tests: packages/runner/test/asset-slots.test.ts:313-331 (C3 veto) and 368-392 (the min-1 retry and skip, already tested for C1); packages/prompts/test/media-contracts.test.ts:20-24; packages/runner/test/e2e/text-media.ts:246-264.
- C:/Users/arvik/code/byway/docs/adr/0090-execution-contracts-for-revising-humans-and-media-steps.md §2: \"C3 keeps its 'no image' answer (owner decision pending)\", and Alternatives.
- C:/Users/arvik/code/byway/docs/backlog.md:84 and :140 (D3); docs/reviews/2026-10-16-review-fix-status.md:21 (F11 \"Fixed, except D3\").
- C:/Users/arvik/code/byway/docs/reviews/2026-10-08-external-review-verification.md: line 38 (verdict: the veto is \"the odd part\"), line 91 (§4 item 3), lines 2880-2914 (F11), 2998, 3163 (B6: C3 v2 drops the veto), 3247 (acceptance test: 1-1, no veto line) and 3298 (\"delegated and reversible; flag it for the owner\"). C:/Users/arvik/AppData/Local/Temp/byway-fixes/designs/cluster-F.json holds the same content.
- Protocol: protocol/03-configurations.md:291 (ASSET? in C3) and :320 (\"Optional: ASSET. Real photos often beat generated ones\"); 01-blocks.md:290 (agents underuse image tools until told), :295 (trigger: \"pretty plain\"), :308 (prune afterwards through CUT); 02-grammar.md:60 (A? runs when its trigger fires); 06-runbook.md:136-138 (direct ASSET instruction, no veto). C3's Trim step: packages/catalog/src/parts.ts:209-221.
- Costs: packages/gateway/src/prices.ts (Sonnet 5.5 $2/$10 per million tokens; Opus 5.5 $4/$20; gemini-nano-banana-2.1 $0.0336 per image; gpt-image-2.5 planning bound of about $0.24); profiles.ts (Balanced uses Gemini, Best uses gpt-image-2.5-sunburst); advisor estimate.ts:46-72 (typical tokens: briefs 3,000 in / 600 out; placing 3,000 in / 1,500 out).
- Research: packages/advisor/src/registry.ts:23 (STUDY_REGISTRY is empty); recipes/c1h.json:144 (C1-H uses article.ASSET, images 1-3); docs/adr/0043-research-credibility-without-compromise.md.
- Feasibility notes: packages/recipe/src/schema.ts:170 (a sequence needs at least one step, so no empty route branch); packages/runner/src/parse.ts:179-181 (the brief answer schema); recipes/c3.json:265 (the prompt is named by id, so B does not change c3's hash); advisor/src/diff.ts:333 (a composed recipe that drops the Yes/No question is shown as \"now always runs\").

### The skeptic

**Does the recommendation hold?** Yes.

#### Weaknesses

- It presents option A as long-standing behaviour. It is not. The "return an empty list" line has been in the prompt since 2026-10-07, but until 9b8dd1c (2026-10-09) the runtime refused an empty answer and asked again ("Write at least one image brief."). So in practice, Yes meant an image. The runtime started accepting "no image" on 2026-10-09, and the explainer's "unless it judges the piece better without one" clause came the same day (944b76e). Both were labelled "D3 pending" (ADR-0090 §2). So A makes a one-week-old placeholder permanent. B gives back what Yes did before 2026-10-09, without the late run failure.
- Two passages disagree about what it takes to recover from a wrong decline. A's cons say it "can only be fixed with a whole new run". 'Why it matters' adds "or make the image outside byway". The second is the realistic fix: a newsletter header is usually added in the publishing tool. The asymmetry still favours B, just by less than the cons say.
- It understates how cheap an unwanted image is to undo. C3's "Your words" step (VOICE) gives the person the whole Markdown text and saves it back exactly as edited (packages/runner/src/copy.ts:76-77 and 266-267). The person can delete the image line there at no cost, with no AI call. Trim is not the only way out.
- The rationale says "B never fails a run". That is true only for an empty answer. Every image B makes goes on to the placing call. If that call misses twice, the whole run still fails and the paid image is lost (backlog row 79; ADR-0090 'Parked'; asset.ts:147-159, which returns no usable part). A has the same risk whenever it makes an image. B adds a little more exposure only in the runs where A would have declined. The claim should be narrowed.
- Some protocol support for B is stretched. The runbook's direct "make images" prompt (06 §5) is in the C1 landing-page section ("The design is quite plain…"). The runbook's C3 section (06-runbook.md:180-208) has no image prompt. Likewise, 01-blocks.md:290 ("agents underuse image tools until told") is about coding agents drawing shapes in code instead of calling image tools. It says nothing about an art director judging a prose piece better without a picture. B does not need either citation: 03 C3, 02's rule for optional steps and 01's "prune through CUT" are enough.
- It misses a research point that favours B under the owner's first priority. C3 is the named generalization target of Paper 2 (ADR-0024: rung 3 is "C3, C6a and C2"). Under A, whether a piece gets an image depends on the model, run to run. Under B, it depends on the person's recorded Yes. A future study would have to pin or disclose A's behaviour. B is one less uncontrolled variable.
- Cons of A that are covered elsewhere are presented as if they were not. The main reason given for keeping the veto is to spare a piece a generic stock-looking header. Under B, the prompt still says "make the header carry that, not the topic's stock picture" (line 21) and "No real people" (line 24). NN/g's finding is about generic stock photos of people, which those lines already forbid. So B's con "the AI can no longer spare a piece a generic header" is weaker than it reads.
- The reversibility fallback points to C or E. E keeps the veto, and C asks you the same question twice. A cheaper middle path exists: no veto, AI advice only (see the missing options). That is the better later path.

#### Factual errors

- "No study uses C3: STUDY_REGISTRY is empty (packages/advisor/src/registry.ts:23)" rests on the wrong evidence. STUDY_REGISTRY holds studies that have reported a verdict (fields `reported`, `verdict`). It is just as empty for C1-H, which is Study 1's arm. The accurate statement: no study is locked or running on C3 today. But ADR-0024 makes C3 the first generalization target (Paper 2). Option D's "no study is registered, so no record is orphaned" has the same flaw.
- "This line has been in the prompt since the first templates (ee86a5d, 2026-10-07)" is literally true but misleading as a description of behaviour. Before 9b8dd1c (2026-10-09), checkBriefs forced at least one brief (`Math.max(1, cap)`, "Write at least one image brief."; see `git show 9b8dd1c^:packages/runner/src/activities/asset.ts`). The veto was never honoured before 2026-10-09.
- "B never fails a run" is overstated. A placing call that misses twice still ends in ContractMissed and fails the run after the image is bought (asset.ts:147-159; docs/backlog.md:79, still open).
- "A wrong decline can only be fixed with a whole new run" (option A cons) contradicts the brief's own 'Why it matters' ("or make the image outside byway"). It also ignores that the "Your words" step lets the person edit the full Markdown.
- Minor: "A 'no image' answer costs about 1-2 cents" is about 1.2 cents on Balanced (Sonnet 5.5) but about 2.4 cents on Best, whose mid tier is Opus 5.5 at $4/$20 per million tokens (profiles.ts:43, prices.ts:43). This does not change any conclusion.

#### Missing options

- B plus an advice note, with no veto and no new question. The AI always writes the header brief the person asked for. It may add one optional line, shown in the step's note, such as "This piece may read better without a header; cut it at Trim if you agree." The person decides at Trim, or deletes the line in "Your words" at no cost. This keeps A's one real advantage (the AI's taste) as advice only. It needs no run-engine change and does not change c3's recipe hash. The brief format is a plain `z.object` (parse.ts:179-181), so adding an optional field is a one-line schema change plus a note in asset.ts. Roughly half a day on top of B. It is the better follow-up than C or E if live use shows many trimmed headers.
- B plus a better-informed Yes. Under B the person's answer is the whole decision, so add the protocol's reason the step is optional to the "Custom imagery" explainer: "Real photos often beat generated ones; if you have one, answer No" (03 C3, protocol/03-configurations.md:320). It is an edit to presentation.ts only, so c3's recipe hash does not change. About 15 minutes.
- Adjacent and outside D3's scope, but worth naming: the real remaining 'optional image step fails the run late' risk is backlog row 79 (a placing miss after the image is bought fails the run and loses the image). That applies under every option. If the owner wants F11's class of harm fully closed, row 79 is the next item, not C, D or E.

#### Revised recommendation

Keep B: your Yes decides. Change C3's image prompt to v3 with `images: 1-1`, delete the \"return an empty list\" line, and say the writer asked for a header image. Drop the explainer's \"unless\" clause. Update the three tests and spec §3.3, and record the decision in a short ADR. Correct four things in the brief. (1) Present A as what it is: a placeholder added on 2026-10-09, pending this decision. Before that date, Yes produced an image in practice. B gives that back without the late run failure. (2) Replace the STUDY_REGISTRY argument with ADR-0024. No study is locked on C3, but C3 is Paper 2's named target. B makes \"is there an image\" depend on the person's recorded Yes rather than on the model, which also serves research credibility (ADR-0043). (3) Narrow \"B never fails a run\" to \"an empty answer never fails the run\". The placing-call failure (backlog row 79) remains for every image made, under A as well. (4) Say that an unwanted image can be removed at Trim, or deleted by hand for free in \"Your words\". A wrong decline is usually fixed by adding an image when publishing, not by a whole new run. Optional, about 15 minutes: add the protocol's heuristic \"real photos often beat generated ones; if you have one, answer No\" to the Custom imagery explainer. If live use later shows many generated headers being trimmed, the follow-up should be 'B plus an AI advice note' (no veto, no new question, no run-engine change), not C or E.

#### Reasoning

I checked the brief against main 07d428e in my worktree, read-only. Most of its code claims are accurate.
- **The step and the question:** c3.ts:54 defines the optional image step and its trigger. interpreter.ts:710-721 and wording.ts:98-99 produce the Yes/No question, with the draft attached.
- **The prompt:** product.c3.asset v2 declares `images: 0-1` and has the veto at line 25.
- **Runtime handling:** asset.ts:105-109 separates the AI's choice (NO_IMAGE_CHOSEN_NOTE, not skipped) from the asked-twice skip (NO_BRIEF_NOTE). slot-plan.ts:48-52 and 97-101 plus call.ts:77-99 give the one retry and the honest skip under 1-1. That path is tested for C1 at asset-slots.test.ts:368-392.
- **Recipe hash:** recipes/c3.json:265 names the prompt only by id, so B leaves c3's recipe hash alone. Prompt templates are read by activities, not by the workflow bundle, so B does not end waiting runs (versioning.ts terminates them only when the bundle hash changes).
- **Costs:** they recompute exactly from prices.ts, profiles.ts and estimate.ts: about 6.7 cents on Balanced and about 31 cents on Best.
- **Feasibility notes for C and D:** sequences need at least one step (schema.ts:170), and only the interpreter can open a question. Both hold.
- **Verification and protocol:** the verification lines (38, 2998, 3163, 3247, 3298) and the protocol lines (03 C3 at :291 and :320, 02's rule for optional steps, 01 ASSET's pruning step) say what the brief says.

The errors are in framing and evidence:
- **STUDY_REGISTRY:** it lists studies that have reported, so it is the wrong proof that no study uses C3. ADR-0024 actually names C3 as Paper 2's target, which strengthens B.
- **History of the veto:** git history shows the veto was not honoured before 9b8dd1c (2026-10-09). The pre-fix checkBriefs forced at least one brief. A is therefore a week-old placeholder, not long-standing behaviour.
- **\"B never fails a run\":** this ignores the still-open placing failure (backlog row 79).
- **\"Only a whole new run\":** this overstates the cost of a wrong decline. The brief's own text says otherwise, and the VOICE step offers the full Markdown for editing (copy.ts:76-77 and 266-267). The same fact makes an unwanted image even cheaper to remove than the brief says.
- **Stretched citations:** the runbook's §5 image prompt belongs to C1, and 01:290 is about coding agents drawing shapes in code instead of calling image tools.

None of this flips the conclusion; most of it strengthens B. Weighed by the owner's priorities:
- **Research credibility:** B matches the protocol for C3, and it makes image presence a recorded human choice in the configuration Paper 2 will study.
- **Small team:** B is the smallest real change, with no hash change and no run-engine change.
- **Proportion:** C and D add questions or run-engine work for a case nobody has measured and that costs cents. E keeps the veto.

The one improvement worth adding is to name a 'B plus advice note' variant as the later path instead of C or E. It keeps the AI's taste as advice without letting it overrule the person.

Files checked:
- C:/Users/arvik/code/byway/packages/prompts/templates/product.c3.asset.md
- C:/Users/arvik/code/byway/packages/runner/src/activities/asset.ts, slot-plan.ts and call.ts
- C:/Users/arvik/code/byway/packages/runner/src/copy.ts
- C:/Users/arvik/code/byway/packages/advisor/src/registry.ts
- C:/Users/arvik/code/byway/docs/adr/0024-evaluation-ladder-paper-one-scope.md
- C:/Users/arvik/code/byway/docs/adr/0090-execution-contracts-for-revising-humans-and-media-steps.md
- C:/Users/arvik/code/byway/docs/backlog.md:79
- C:/Users/arvik/code/byway/protocol/06-runbook.md:134-208

## D4: repository administration and the decision log's rules

*Claude's note: where it was decided, [ADR-0103](../0103-adr-log-rule-and-ci.md). The owner said "proceed", with no macOS for now (2026-10-16 19:53), and asked for the rulesets (2026-10-16 20:17). The owner's words are in [conversation-continued.md](conversation-continued.md). Redacted below, by Claude at the owner's request of 2026-10-21: the names of the owner's other repositories ("[another repository]"), their Actions minutes, the organisation's September overage, and its plan's name, seat count, price, included minutes and their dollar value ("[redacted]"). The brief weighed them because a CI job's minutes come out of a pool the organisation's repositories share; byway's own estimates are as written.*

### The brief

**Decision.** D4: Repo administration and the ADR-log rules (review items R1 and R3). This is three linked calls: (a) should a GitHub service (CI, meaning "continuous integration": a GitHub machine that runs the checks on every push) run `pnpm verify` automatically, and on which operating system; (b) should GitHub protect `main` (refuse history rewrites, and perhaps refuse commits that have not passed the checks); (c) which ADR-log rules you confirm, given that they touch ADR-0001 (you set the log's format) and CR14 (you approved the charter). There are also two small sub-calls: how to treat ADR-0100's edit after acceptance, and the wording of a note on ADR-0041.

**Question.** Should byway's full test gate run automatically on GitHub, should GitHub protect main's history, and which rules for the decision log should a test enforce?

#### Today

**Checks**
- `pnpm verify` (package.json:17, added in f6e4ca9) runs three steps and stops at the first failure: the typecheck, 4,702 unit tests in 186 files, then 53 browser tests.
- Nothing runs it automatically. The README says so twice: the Scripts table (line 47) and the Tests section (lines 141-152, "No CI service runs these checks. `pnpm verify` is the gate to run before merging"). scripts/test/readme.test.ts pins that wording.
- There is no .github folder and no .node-version file. package.json has no packageManager field, and `engines` asks only for Node >=24.
- The README's Quick start (line 11) says "Windows, macOS and Linux". But the suite has only ever run on Windows. The Linux and macOS code paths have never executed:
  - scripts/serve.ts:71 stops the server with SIGTERM instead of taskkill;
  - scripts/e2e.ts:129;
  - apps/web/test/dev-server.real.test.ts:49-70 uses ps and lsof.

**GitHub** (read with gh on 2026-10-16)
- wavemanco/byway is private, and you have admin rights.
- `main` is not protected. There are 0 rulesets and 0 workflows. Actions is already enabled for the repo.
- The org is on [redacted] ([redacted], [redacted] a month). That plan includes [redacted] Linux-rate minutes a month (about [redacted] of runner time), shared by all the org's repos.
- All 24 pushes to main recorded in the local clone were fast-forwards: none rewrote history.

**ADR log**
- Accepted records are never edited, by convention (docs/adr/README.md:7 and :10).
- Since 2026-10-16 (commits f230909 and f69b3da), the index has "changed by" links: 20 Accepted records carry 30 links. No record has a Changes row or a Later-records section, and no test reads ADR text.
- CR14 (ADR-0057:32) says "CI fails any edit to their Context or Decision sections". Nothing checks this.
- I ran a read-only history probe:
  - On main's own history, 92 of 93 Accepted records are unchanged since they reached main.
  - The exception is ADR-0100. Its Decision item 7 was edited in f69b3da, 56 seconds after its merge 1cef8d0. Both commits reached GitHub in the same push at 06:01.
- ADR-0041's Status says Accepted, but its Decision opens "Proposed, not decided." (line 17). Six live files cite "ADR-0041 rule 3": README, spec §6, ADR-0066, ADR-0071, packages/contracts/src/store.ts and packages/store/src/datadir.ts.

**Promises that assume a CI exists**
- spec §4 line 157 (a claims scan of apps/web) and §6 line 184 (the import boundary);
- ADR-0055:30 and :40;
- ADR-0059:96 ("When: Now");
- CR14 (ADR-0057:32 and :55);
- ADR-0068:16's merge gate.

The checks themselves exist as tests (apps/web/test/guard-claims.test.ts and guard-boundaries.test.ts) and run inside `pnpm verify`.

The backlog row D4 (docs/backlog.md:141) sets the default until you decide: "Local `pnpm verify` only".

#### Why it matters

The tests are what keep the person's money and keys safe from one change to the next:
- spend caps and the spend ledger;
- keys never leaving the gateway;
- generated pages that run nothing without consent.

Today they protect the person only when someone remembers to run them. Agents put 87 commits on main in 10 days and wrote 20 ADRs in 8.

The honour system has held for the tests: the gate passes on main today, and I re-ran it.

It has already slipped once on the decision record. ADR-0100's Decision was edited after it was accepted, which CR14 forbids, and nothing noticed.

CR14 is a charter rule you approved under ADR-0043 (research credibility comes first). Its "CI fails any edit", protected branches and signed commits are due before the brief draw, around November 2026 (playbook line 42). Several accepted records and the spec also say "a CI check" does things that only a manual command does today.

One practical catch: a known Windows-only flaky test would make any automatic check raise false alarms. It is the ledger timestamp test. Its fix is still on fix/flaky-ledger-tamper-mtime, and main's ledger.ts:507 still caches by size and modified time, so the flake still applies to main.

#### Options

##### 1. Keep today's honour system (status quo)

Nothing changes:
- `pnpm verify` is run by hand before merging.
- main stays unprotected.
- The ADR rules stay written but unchecked.
- The README keeps saying no CI runs.
- Backlog D4 stays open.

For the person using byway: nothing visible. The risk is a regression in a money or key guard reaching the copy they run, if a merge skips the gate.

Pros:

- No cost and no work.
- No friction for the agent-driven workflow.
- The README is already honest that no CI runs.

Cons:

- CR14's "CI fails any edit" stays unmet, and it has already slipped once unnoticed (ADR-0100, f69b3da).
- The "CI check" statements stay untrue as written: spec §4 and §6, ADR-0055, ADR-0059 ("When: Now") and ADR-0068's merge gate.
- Anyone with push access can force-push GitHub's main, so the history the charter treats as tamper-evident can be rewritten.
- The playbook's public-record row (protected branches, ADR CI) is due before the brief draw anyway, so this only postpones the work.
- The 'ADR-0041 rule 3' confusion stays.

Work: None.

##### 2. Protect the record and check it locally, no CI (minimal)

Three changes:
- **Branch protection:** one GitHub ruleset on main that blocks force pushes and branch deletion. No required check and no bypass list.
- **ADR test:** a new test, scripts/test/adr-records.test.ts, inside `pnpm verify`:
  - A record's Context and Decision must equal the text it had when it first reached main as Accepted. The test reads main's own line of history, so drafts revised on a fix branch before merging do not count.
  - The header status must match the index row.
  - Every "changed by" link must resolve.
  - ADR-0100's 56-second edit is listed as the one named exception, with its commit and reason.
- **One new ADR, which needs your yes:**
  - The rule: final once on main; the changed-by link is added in the same commit as the record that changes another.
  - A note on ADR-0041 that says first that it is not a ratification, and that 'rule 3' means the third listed rule.
  - ADR-0068's merge gate restated as "`pnpm verify` passes".
  - What 'CI check' means in the older records.

No CI. For the person: nothing visible.

Pros:

- About 5 minutes of your clicks and no money.
- No friction: all 24 pushes so far were fast-forwards, so blocking force-pushes changes nothing in practice.
- CR14 is enforced whenever the gate runs.
- The history GitHub holds can no longer be rewritten.
- Fixes the ADR-0041 confusion without editing it.
- The relations stay where they already are: the index's 30 changed-by links.

Cons:

- Running the check still depends on memory, so CR14's "CI fails" is still not literally true.
- Nothing runs on its own, so a skipped gate goes unnoticed.
- The README's "Windows, macOS and Linux" stays unverified for Linux and macOS (the README line should say so).

Work: Small (S), about a day of agent work:
- the test (about 150 lines, plus a temporary git-repo fixture proving that an edited Decision fails and an appended note passes; the history scan took about 10 s in my probe);
- the new ADR, the README 'How to read this log' rule, the index count, the backlog and playbook rows.

About 5 minutes of your admin time for the ruleset.

##### 3. Option 2 plus one automatic Windows check on every push to main, reporting only (recommended)

Everything in Option 2, plus a file .github/workflows/verify.yml with one job on GitHub's windows-2025 machine. Windows is the only platform the suite is known to have run on.
- **When it runs:** on every push to main, and by hand.
- **Pinned tools:** Node 24.13.1 (a new .node-version file) and pnpm 11.12.0, matching your machine.
- **Full git history,** so the CR14 test can read it.
- **Cached:** Playwright's Chromium and the Temporal CLI.
- **Locked down:** read-only permission and no secrets. The browser tests already use stand-in keys and fail if one leaks, so CI can never spend money or see a key.
- **Bursts:** a newer push cancels the older run.
- **Reporting, not blocking:** a red run emails you and puts a red X on the commit. Nothing is refused.

Preconditions and follow-ups:
- Merge the ledger timestamp flake fix (or an equivalent) first.
- Change the README line to "CI runs `pnpm verify` on Windows for every push to main; Linux and macOS are not tested".
- A Linux job goes to the backlog with a trigger.

For the person: no change in use. A regression in caps, key handling or page consent shows as a red mark about 25 minutes after it reaches GitHub.

Pros:

- The checks finally run on their own, on the same OS where all 4,702 unit tests and 53 browser tests pass. No Linux bring-up work.
- The 'CI check' statements become literally true, as detection.
- The CR14 test runs on GitHub's protected history.
- Cheap. One run takes about 25 minutes, about $0.25. At 20 to 70 pushes a month that is 500 to 1,750 Windows minutes, $5 to $18 gross. That is [redacted] of the included pool, so likely $0.
- No change to how merges happen.

Cons:

- It finds problems after they reach main and does not prevent them. Main can show red for a while.
- Windows minutes cost about 1.7 times Linux minutes, and Windows runs are slower.
- Linux and macOS stay untested.
- A flaky test makes it raise false alarms. Two are known: the ledger timestamp flake (fix not merged) and a rare F15 browser-test flake in the backlog.
- Minutes are shared with the org's other repos. In September another repo ([another repository]) used the whole pool and the org paid [redacted] extra. In such a month byway's runs would be billed, still $5 to $18.

Work: Small to medium (S-M), about 1-2 days including Option 2:
- the workflow (about 60 lines; pin third-party actions to commit SHAs);
- .node-version;
- README and readme.test.ts updates;
- the first green run, plus one deliberate red probe (put 'proven' in an apps/web string; guard-claims must fail).

Your part: the ruleset click and the yes on the log rule.

##### 4. The verification's full design (cluster R option B, as written)

Three parts:
- **CI on two systems:**
  - a Linux job (ubuntu-24.04) on every push and pull request;
  - a Windows job nightly, on pull requests and on demand.
- **Blocking protection on main:** the `verify` check is required, and force pushes are blocked. GitHub then refuses a push to main whose commit has not already passed, so changes go through a pull request or a branch push first.
- **Full ADR-log rules:**
  - a structured Changes row in every new ADR, with a closed list of verbs: corrects, replaces, supersedes, extends, narrows, amends, annotates;
  - a matching 'Later records' section appended to each changed record, with a test that every link has its partner;
  - a prompt when a relation verb has no row;
  - a check on Accepted records whose Decision still uses proposal wording;
  - the CR14 history check;
  - a one-time audit back-filling every relation (now 30 links across 20 records);
  - three new log rules and the ADR-0041 note.

For the person: the same as Option 3, except that GitHub refuses a failing main. But byway runs from your local checkout, and merges happen locally before a push. So the block protects GitHub's copy, not the copy the person runs, unless the workflow moves to GitHub pull requests.

Pros:

- Strongest guarantee: nothing reaches GitHub's main without a green gate.
- Linux gets verified, which makes the README's Linux claim true.
- Each record carries its own pointers, so someone reading one file sees what changed it.
- Every promise is met as worded.

Cons:

- The Linux job first needs bring-up of code that has never run, at an unknown cost: the SIGTERM-only stop in serve.ts:71 and e2e.ts:129, and ps/lsof in dev-server.real.test.ts. If D2 turns Chromium's sandbox on, Ubuntu 24.04 also needs extra setup.
- Every merge waits about 20-25 minutes for CI, and needs a pull request or a pre-checked commit. That is a big change for an agent workflow that merged 87 commits in 10 days.
- A flaky test blocks merges.
- The design's CR14 check needs fixing before use. As written ('first commit where Status read Accepted', across all branches) it fails today on 13 records that were legitimately revised on fix branches before merging (ADR-0081, 0082, 0086, 0087, 0090-0093, 0095, 0097-0100).
- More ceremony for every new ADR. The back-fill also touches about 35 Accepted files: CR14 allows header rows and appended sections, but the rules must say so.
- Costs about $10-42 a month gross, about [redacted] of the pool with pull requests. Without pull requests and with nightly Windows runs, about $10-16.

Work: Large (L), the verification's estimate, plus Linux bring-up of unknown size. It includes:
- the workflow;
- branch protection;
- the relations test with its partner check;
- the 100-record audit and back-fill;
- the new ADR and rules;
- switching to pull requests.

Your part: the protection settings and confirming the rules.

#### Recommendation

Option 3, in three steps.

1. **Now, about 5 minutes.** Add a ruleset on main that blocks force pushes and deletion, with no bypass list. It is a repository setting, so you do it, or you tell Claude explicitly to do it with gh.
2. **Say yes to the minimal log rule:** "A record's Context and Decision are final once it reaches main as Accepted. Drafts on a branch may change before merging. The index's changed-by link is added in the same commit as the record that changes it." Then an agent:
   - adds the history test to `pnpm verify`;
   - lists ADR-0100's 56-second edit as the one named exception;
   - writes one new ADR with the ADR-0041 note (saying it is not a ratification), ADR-0068's merge gate restated, and what 'CI check' means in the older records.
3. **Once the Windows flake fix is merged,** add the single Windows job on every push to main, reporting only.

Keep the rest of the full design as backlog items with triggers:
- A blocking (required) check, when a second person merges to main or before the public mirror.
- A Linux job, before any distribution or when anyone runs byway on Linux.
- Structured Changes and Later-records rows, if a reader such as a paper reviewer needs the pointers inside each record.

#### Rationale

**The person's safety and money.**
- CI never spends money and never sees a key. It has no secrets, and the browser tests use stand-in keys and fail if one leaks.
- It re-runs every test that guards caps, keys and page consent on each change.
- Its only cost is runner minutes: about $5-18 a month for Option 3, most likely $0 inside the included pool.
- byway runs from your local checkout, and merges happen locally before a push. A blocking check on GitHub would guard GitHub's copy, not the copy the person runs. A reporting check gives most of the protection without forcing a pull-request workflow on a small, agent-driven team.

**Research credibility first (ADR-0043).** The part of D4 that bears on credibility is CR14's tamper-evidence. That needs two things:
- history that GitHub will not let anyone rewrite: the ruleset;
- a check that compares accepted records against that history: the test, run by CI.

Option 3 delivers both. The honour system has already let one edit through, so this is not hypothetical. The structured relation rows are a reading aid, not a safeguard, and the index already holds all 30 links.

**Proportion.**
- Windows is the only platform the suite has run on, so a Windows job needs no bring-up work.
- A Linux job would first have to fix process-stopping code that has never run, for a platform nobody uses yet.
- The full design's history check must be corrected before it can be adopted anyway: it would fail today on 13 records revised on fix branches before merging.

**Why not the others.**
- The status quo leaves the CR14 deadline (around November 2026) unmet.
- Option 2 enforces the rule only when someone remembers.
- Option 4 is heavy machinery for rare cases.

**What to watch.** A flaky test makes a reporting check raise false alarms. Merge the ledger timestamp fix first, and quarantine any new flake quickly.

#### Evidence

**Gate timing I measured** (2026-10-16, main 07d428e, my worktree, a 16-thread Windows machine)
- typecheck 5 s; unit tests 180 s (4,702 passed); browser tests 291 s (53 passed, 4.5 minutes of tests plus build and stop). Total about 8 minutes.
- The unit tests with two workers, standing in for GitHub's 2-CPU runner: 264 s.
- Logs: C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/decisions/D4-repo-admin/timings.txt, plus typecheck.log, vitest.log, e2e.log and vitest-2workers.log.
- Earlier gates for comparison: today's final gate (scratch/final-cleanup/tests-link) took 164 s for the unit tests and 4.4 minutes for the browser tests. The 2026-10-15 re-check, run under load, took 268 s and 446 s.

**Per-run CI estimate**
- Setup takes about 3-5 minutes. The unit tests take about 7-9 minutes and the browser tests about 6-8 minutes on 2-CPU machines.
- So one run is about 20 minutes on Linux and about 25 on Windows.

**Pricing** (docs.github.com, billing pages)
- Linux 2-core costs $0.006 a minute and Windows 2-core $0.010. Each job is rounded up to whole minutes.
- [redacted] includes [redacted] minutes a month.
- Private-repo runners have 2 CPUs and 8 GB of RAM.

**Org Actions usage** (gh billing API; saved in github-actions-usage.txt)
- August: [another repository] used [redacted] Linux and [redacted] Windows minutes, all free.
- September: [another repository] used [redacted] Linux and [redacted] Windows minutes, and the org paid [redacted] extra.
- October to date: [another repository] used [redacted] Linux minutes, free.

**Repo state** (github-repo-state.txt)
- main is not protected. There are 0 rulesets and 0 workflows. Actions is enabled. The org plan is [redacted], with [redacted].

**Push history**
- The local reflog records 24 pushes to origin/main: 8 on Oct 7, 8 on Oct 8, 6 on Oct 9, 1 on Oct 15 and 1 on Oct 16.
- All 24 were fast-forwards (ff-check.mjs).
- That rate is 20-70 runs a month, so Option 3 means 500-1,750 Windows minutes ($5-18).

**CR14 probes** (cr14-probe.mjs and cr14-probe-mainline.mjs, outputs in the matching .out files, about 10 s each)
- Across all history: 13 of 93 Accepted records were changed after they first read Accepted, on fix branches.
- On main's own history: only ADR-0100 was changed. Its Decision item 7 was edited in f69b3da (05:54:23), 56 seconds after the merge 1cef8d0 (05:53:27). Both were pushed at 06:01.

**Changed-by links** (changed-by-count.mjs): 20 changed records, 30 links, 15 changing records, 0 Changes rows or Later-records sections.

**The flaky-test fix:** fix/flaky-ledger-tamper-mtime, commit 3822920. It changes tests only, in two files (gateway.test.ts and ledger.test.ts), and is based on f7b1b83 (Oct 9). main's packages/gateway/src/ledger.ts:507 still caches verify() by size and modified time.

**Sources in the repo**
- the verification report: §4 item 4, cluster R option B, its design and its residuals (lines 4392-4895);
- the status page: lines 31, 33 and 53;
- the backlog: line 123 (R3 remainder) and line 141 (D4);
- the playbook: line 42;
- ADR-0001, ADR-0041:17, ADR-0057:32 and :55, ADR-0059:96, ADR-0060, ADR-0062, ADR-0068:16 and ADR-0094;
- spec lines 157 and 184; README lines 11, 47 and 141-152; package.json:17.

**Read-only.** Nothing was changed in C:/Users/arvik/code/byway or on GitHub. Every gh call was a read.

### The skeptic

**Does the recommendation hold?** Yes.

#### Weaknesses

- It overstates what this does for research credibility. A ruleset and a CI run on a PRIVATE repo leave nothing an outside reader can check. And the owner is an org admin, so the owner, or any agent using the owner's admin gh login, can switch the ruleset off, force-push, and switch it back on. The org audit log records that, but nothing prevents it. ADR-0060:22 already says a private repo alone does not meet CR14. The credibility payoff comes from playbook row 42: the public mirror, DOI snapshots and published hashes for private ADRs (CR14's 'CI hash check', ADR-0057:34 and :55). None of the options mention them. D4 is groundwork for that step and should be described that way.
- Signed commits are missing from every option. CR14 (ADR-0057:29) and playbook line 42 list them next to protected branches and ADR CI, and the brief's own 'why it matters' says they are due. Yet no option asks the owner to decide on them.
- It misses the strongest evidence for running checks automatically. 49 of main's 87 first-parent commits are direct commits, not merges. The README's rule is 'run `pnpm verify` before merging', so it never covers them. Of the 18 direct commits since noon on Oct 8, 15 edited docs/adr/README.md (the ADR index). That is how ADR-0100's edit got in: f69b3da was a direct docs commit. So Option 2's 'CR14 is enforced whenever the gate runs' would rarely cover the commits that actually change the log. Checks on every push close that gap. This makes the case for Option 3 over Option 2 stronger than the brief does.
- It misreads the ADR-0100 incident. It was a merge race. The code fix 730ebc7 reached main in 4559fe8 at 05:53:13, and ADR-0100 reached main 14 seconds later in 1cef8d0, so item 7 was already false when it arrived. The agent noticed and corrected it 56 seconds later. The broken rule went unnoticed, but the content error did not, and the uncorrected text never reached GitHub by itself. Listing the edit as a named exception is still the right call: restoring the original text would put back a false sentence. But 'already slipped and nothing noticed' overstates it.
- The minimal ADR test drops the cheapest check that matches a known failure: an Accepted record whose Decision still reads like a proposal (the full design's check (c)). ADR-0036 to 0039 still open with 'Proposed, not decided.', and playbook line 44 plans to accept ADR-0034 to 0038 before Stage 0. Without a rule that the commit accepting a record also finalises its Decision text, plus a check (about 10 lines), the ADR-0041 confusion will happen five more times.
- The history test checks main's first-parent line (the chain of commits made on main itself, skipping the inside of merged branches). That only works while branches are merged with --no-ff (always making a merge commit), as all 38 merges so far were. If a branch is ever fast-forwarded and an ADR on it was revised after being marked Accepted, the test goes red for no real reason. The rule has to say this.
- One con given for Option 4 is not a real difference. Its history check failing on 13 records is fixed by one flag (--first-parent), and the recommended test needs that same flag. It is not a reason to prefer Option 3.
- It understates the flaky-test risk on GitHub's machines. The suite has only run on a 16-thread desktop. The two-worker run there (264 s) is a poor stand-in for a 2-CPU runner, where the Temporal servers, Chromium and the Next build share the same two cores. 22 test files set 142 explicit timeouts, including the liveness, worker-loss and engine-state tests. Main already had to raise two ledger tests to 30 s (70018c6). Expect new timing flakes on the first runs, and runs of roughly 25-40 minutes rather than 25. The cost stays trivial, about $0.25-0.40 a run.
- A report-only check needs someone to read it. The brief has no reader for it. Red runs email the owner, who has said not to be drawn into admin, and agents never see the red X unless an instruction tells them to check.
- Waiting for the ledger fix holds up the CR14 check needlessly. The ADR-history test and the claims and import-boundary guards just read files. They work the same on any OS and have nothing to do with the ledger flake or Windows, but Option 3 makes them wait for another session's branch.
- The 'promises CI would make true' con is weaker than shown. ADR-0059:96's import check protects against importing an evaluation side that does not exist in this repo yet: there is no evaluation package, and ADR-0032 puts that side in Python. guard-boundaries.test.ts already runs in the gate. The gap is mostly wording.
- Tags are not protected. CR14's snapshot at each milestone will be a tag, and the same five-minute admin step could stop tags from being moved or deleted.

#### Factual errors

- 'scripts/test/readme.test.ts pins that wording' is wrong. Only the file's header comment mentions that no CI exists. Its assertions pin the verify chain and the commands in the Tests section, not the sentence 'No CI service runs these checks'. Option 3 therefore needs no test change for that sentence, only the comment.
- 'The history GitHub holds can no longer be rewritten' is wrong. An org admin can edit or delete a ruleset (bypass list or not), force-push, and put it back. The ruleset makes a rewrite deliberate and logged, not impossible.
- 'Option 3 delivers both' things CR14's tamper-evidence needs is wrong for a private repo. Outsiders can see neither the history nor the CI runs. ADR-0060:22 says a public mirror or archived snapshot is required.
- 'It has already slipped once... and nothing noticed' is overstated. The content error was noticed and fixed 56 seconds after the merge. Only the append-only rule's breach went unnoticed, and the original text never reached GitHub by itself (both commits went in the 06:01 push).
- Calling the ledger flake 'Windows-only' is not strictly right. The cause is a same-size rewrite landing in the same modified-time tick, which can also happen on Linux's coarse file timestamps. It has only been seen on Windows. The fix itself (3822920) is test-only: 2 files, +13/-3. It merges cleanly onto main (checked with git merge-tree), and main's one later change to those files (70018c6, a 30 s timeout) does not conflict. I did not run it.
- The verify script is on package.json:18, not :17. Line 17 is e2e. Also, serve.ts:71 is the taskkill line, and the SIGTERM branch is :72.
- '87 commits on main in 10 days' counts only main's first-parent line. 38 of those are merges, and 546 commits in total reached main. Not wrong, but ambiguous.

#### Missing options

- An opt-in pre-push hook: a script git runs automatically before each push. It would run the fast checks (typecheck, the ADR-records test, the claims and import-boundary guards, the README test), in under a minute. It costs nothing, catches problems before they leave the machine, and covers the direct docs commits. It can be skipped with --no-verify. The verification report's own Option C included it, and the brief dropped it.
- Split the CI in two. First, a small Linux job on every push that runs only the checks that just read files: typecheck, ADR records, claims, boundaries, README. About 2-4 minutes, about $0.02 a run, and it can start now with no Linux bring-up and no wait for the flake fix. Second, the full Windows `pnpm verify` job once the ledger fix is merged.
- An explicit call on signed commits. Recommended: defer them to the public-mirror step and write the deferral into the new ADR so the CR14 gap is recorded, not dropped. The alternative is SSH commit signing now, without requiring it in the ruleset.
- A tag ruleset that blocks moving or deleting tags, added in the same admin step. CR14's milestone snapshots will be tags.
- One manually started Linux run (about $0.12) to measure the bring-up work, instead of calling it 'unknown' and using that as a reason to defer.
- A weekly scheduled run. The tests download the Temporal CLI and Chromium at runtime, and pushes stop for days at a time (none Oct 10-14), so a weekly run catches breakage in those downloads.
- Tighten the repo's Actions policy. allowed_actions is 'all' and sha_pinning_required is false today. Requiring GitHub-owned or SHA-pinned actions enforces the pinning as a repo setting instead of relying on whoever writes the workflow.
- For ADR-0100, show the alternative that was rejected: restoring item 7 and adding a note after it. It was rejected because the restored sentence would be false on main.

#### Revised recommendation

Keep Option 3 and its order, with these changes.

1) Now, about 5 minutes of your admin time:
- A ruleset on main that blocks force pushes and deletion.
- A second ruleset that blocks moving or deleting tags.
- Optionally, require GitHub-owned or SHA-pinned actions in the repo's Actions policy.
Describe these honestly: they stop accidents and make a history rewrite deliberate and logged. They do not make it impossible, and on a private repo they add no credibility outsiders can check.

2) Say yes to a log rule worded to cover all of this:
- A record's Context and Decision are final once it reaches main's first-parent line as Accepted.
- Branches are merged with --no-ff.
- The commit that changes a Proposed record to Accepted may finalise its Decision text. ADR-0034 to 0038 are due for acceptance before Stage 0, so this matters soon.
- The index's changed-by link is added in the same commit as the record that makes the change.

Then an agent:
- adds the history test to `pnpm verify`, including the proposal-wording check, with ADR-0041 as its one known case pointing at its note;
- lists ADR-0100's edit as the one named exception, explaining the merge race;
- writes one new ADR covering the ADR-0041 note, ADR-0068's merge gate restated as '`pnpm verify` passes', and what CR14 still lacks: signed commits, the public mirror, DOI snapshots and published hashes. All of those stay on playbook row 42. Decide signing at the mirror step.

3) CI, reporting only:
- If the ledger fix is delayed, or you want the record checks live at once, add a small Linux job now that runs the checks that just read files (typecheck, ADR records, claims, boundaries, README) on every push.
- Once the ledger fix is merged (it is test-only and merges cleanly), add the full `pnpm verify` on windows-2025 on every push to main, plus a weekly scheduled run.
- Start it by hand 3 to 5 times before trusting a red result. Quarantine any new timing flake quickly.
- Add one README line telling agents to check the last main run (`gh run list --branch main --limit 1`) before merging, so a red mark does not depend on you reading email.

Optional: a pre-push hook for the fast checks.

Keep the backlog triggers: a required (blocking) check when a second person merges or the mirror goes public; Linux, measured first with one $0.12 manual run, before the replication kit or any distribution; structured Changes and Later-records rows if a reviewer needs them. When the public mirror exists, run the ADR job there too. That is where the credibility payoff actually happens.

#### Reasoning

I checked the brief against main 07d428e in my own worktree, read-only on the main checkout, and against the D4 analyst's probe outputs. Most of the facts hold:
- `pnpm verify` chains typecheck, unit tests and browser tests.
- There is no .github folder and no .node-version file.
- The README says 'Windows, macOS and Linux' at line 11 and 'No CI' at lines 47 and 152.
- CR14's 'CI fails any edit' is at ADR-0057:32.
- ADR-0041:17 says 'Proposed, not decided.'
- ledger.ts:507 still caches by size and modified time.
- The history probes: 13 of 93 records changed across all history, 1 (ADR-0100) on main's first-parent line.
- The billing data confirms $0.006 a minute for Linux, $0.010 for Windows, and the [redacted] September overage.
- The log, 186 test files and 4,702 unit tests passing, is real.

The recommendation still follows, but mainly for a reason the brief leaves out. The README's honour rule covers merges only. 49 of main's 87 first-parent commits are direct commits, and 15 of the 18 since noon on Oct 8 edited the ADR index. ADR-0100's edit came in exactly that way. A check on every push covers those commits, and a gate run only before merging does not. That puts Option 3 ahead of Option 2 on safety and on the record. Option 4's blocking design still guards GitHub's copy rather than the local checkout the person runs, at real cost to the agent workflow, so the 'proportion' argument holds.

The credibility argument is overstated. A private repo's ruleset can be lifted by its admin, and neither the history nor the CI runs are visible to outsiders. ADR-0060:22 says so itself. Tamper-evidence a reader can check needs the public mirror, DOI snapshots and published hashes in playbook row 42. Signed commits, which CR14 requires, appear in no option.

The ADR-0100 'slip' was a merge race (730ebc7 reached main 14 s before ADR-0100), corrected within a minute and never pushed in its original form. The named exception is still right.

The brief misses several cheap items:
- a proposal-wording check, since five Proposed records are due for acceptance;
- the --no-ff dependency of a first-parent test;
- tag protection;
- someone, or an agent instruction, to read the CI results.

It also underplays timing flakes on 2-CPU runners: 142 explicit timeouts across 22 files, and a recent 30 s timeout bump on main.

A few minor factual errors:
- readme.test.ts does not pin the 'no CI' sentence;
- the verify script is on package.json:18, not :17;
- 'Windows-only' is too strong for the mtime flake.

None of these overturn Option 3. They change how it is worded, add three small items, and allow an optional split so the record checks need not wait for the ledger fix.

## The held questions

*Claude's note: where it was decided, nowhere yet. The owner asked whether they could be held for a while (2026-10-17 08:24), and they are held as rows of `docs/backlog.md` under "Product follow-ups". The owner's words are in [conversation-continued.md](conversation-continued.md).*

### The brief

**Decision.** The review-fix work left four questions open. They are in docs/backlog.md under Product follow-ups. (1) Should page VOICE's browser arbiter (ADR-0081) be replaced by a simpler "content layer", and if so, now or later? (2) Should the ST9/ST10 "human-critique" case 2 refusal (ADR-0098) stay as it is, or be narrowed? (3) Does an AI direction made from a person's answer count as carrying that answer to the work (ADR-0098)? (4) Should C2's mood boards cover only the options the person chose, or every option?

**Question.** How should byway settle the four questions the review fixes left open: how page VOICE is built, one admission refusal, one admission reading, and how many C2 mood boards to buy?

#### Today

Everything below is as on main at 07d428e.

(1) Page VOICE, from ADR-0081.
- When the question opens, pageQuestion (packages/runner/src/activities/human.ts:151-166) loads the page in the runner's own Chromium. It runs the page's scripts, scrolls through it, and judges every character by its box. That "visitor read" is pages.ts shownText and makes up about 1,500 of pages.ts's 2,177 lines.
- The person is offered only the lines Chromium shows in one piece (page-arbiter.ts, 779 lines).
- When the answer comes back, writePageVoice (human.ts:351-394) places the edit with fixed rules (page-copy.ts, 2,403 lines; html-tokens.ts, 278 lines) and checks it in code. It then reads the written page in Chromium again. If a visitor would see anything other than the person's edit, nothing is stored and the person is asked again.
- Each question costs 2 Chromium reads and each write costs 3. No model is called.
- The page builders write free-form HTML and treat the copy as placeholder. There are no marked copy places. The builders are article.SEED (steps.ts:15), article.CRIT-W and helper.asset.integrate@web-page, which Study 1's C1-H arm also uses, plus runbook.cut-apply and runbook.tells-swap, which only C1 uses.
- Round 14 ran 46 realistic pages. 1,527 of their 1,637 lines were offered; 110 were not (FAQ answers in closed details, menus shown only on phones, carousel testimonials, screen-reader labels, counters a script makes). Of 8,609 answers, 8,556 were stored and 53 were refused with a reason. No stored write showed a visitor different words.
- The owner accepted one known limit, the raised badge beside a word.
- The work took 14 rounds between 8 and 15 Oct, and 110 commits on main mention F07.
- The verification report estimated page-copy.ts at about 600 lines.

(2) ST9/ST10 case 2.
- packages/validator/src/checks/structural.ts:134-135 (ST9) and :157-158 (ST10) refuse a composed recipe that puts a person's list (or a critique) last in an audit lens, with no other lens noting anything, or last in a final check's body.
- The reason: interpreter.ts audit() (745-751) and gate() (753-756) drop an empty answer and pass on what came before. The fix step after them then applies an older critique.
- If there is no older critique, the fix still runs. interpreter.ts:345 skips a fix only when it carries the "Nothing to remove" mark, and prompting.ts:174 fills a missing critique with empty text. So it is a paid call with an empty list.
- This hits composed recipes only. No catalog recipe has this shape. It accounts for 300 of the 28,856 refused answers in the test corpora (136 under ST9, 164 under ST10).

(3) An AI direction carrying a person's answer.
- In packages/recipe/src/semantics.ts, carriesOn (line 1118) and answersReachingWork (line 1215) count a person's answer as reaching the work when an AI step takes it in, writes text of its own (for example a sharpened brief), and that text reaches the work.
- So composed C2 and C6a recipes whose reaction is also given as a critique are admitted, as main admitted them before the fixes. In the round-7 verification, the C2 variant's sharpened brief reached the option map in 32 of 32 runs.
- The catalog's C2 and C6a work this way for their "taste" answer (you react, the AI sharpens a brief), but that rule does not check them.
- ADR-0098 line 116 says this is implemented as main admits it, and "the owner is still to confirm it".

(4) C2 mood boards.
- What the person is told: the step's trigger (catalog c2.ts:62) and its explainer (presentation.ts:170) say the boards are "for the chosen option". The advisor's pre-start estimate budgets 1-3 images (estimate.ts:237, DEFAULT_SLOTS = 3).
- What actually runs: product.c2.mood-boards (v2, "images: each") and slot-plan.ts:36-40 make one image for every option in the option map. The map lists every option left after merging duplicates, so up to 12.
- Cost per image: about $0.034 on the Balanced profile. On the Best and OpenAI profiles the planning bound is about $0.24.

#### Why it matters

(1) VOICE is the product's core promise: "a human writes every reader-facing line" (spec §3.2; protocol 01 VOICE step 7, "inserts the human copy exactly").
- Today that promise is kept by imitating how browsers show a page. That took 14 fix rounds and about 4,500 lines of runner code plus about 2,600 test lines, all of which a small team now maintains.
- It still leaves about 1 line in 15 on realistic pages that the person cannot write.
- A rebuild would change the page-building prompts. Those prompts touch Study 1, so research credibility (ADR-0043) decides how and when it can be done.

(2) and (3) decide which composed recipes a person may start, and whether byway asks for an answer it then ignores or overrides. Overriding a person's answer is the F01 class of harm, the review's top (P1) finding.

(4) is money and honesty. The person opts in to boards "for the chosen option", sees an estimate for 1-3 images, and can pay for up to 12. With 12 images, that is about $0.41 on Balanced and up to about $2.90 on Best or OpenAI.

#### Options

##### 1A. Keep the browser arbiter as it is (status quo)

Page VOICE stays as it is. You edit the lines Chromium shows, and byway refuses any write a visitor would see differently. Known limits are not fixed one by one, which is already the backlog policy.

Pros:

- It works, and it was checked: on 46 realistic pages, 8,556 of 8,609 answers were stored and 53 were refused with a reason. No stored write showed a visitor different words.
- It fails closed: it refuses rather than writing the wrong thing.
- No work, no prompt or recipe change, nothing for the research track.

Cons:

- About 4,500 lines of browser-imitation code and about 2,600 test lines to maintain. Chromium, Playwright or CDN changes can bring refusals that no rewording fixes.
- 110 of 1,637 lines (about 7%) are never offered: FAQ answers in closed details, phone-only menus, carousel testimonials, screen-reader labels. These are reader-facing words you cannot write.
- Every page VOICE needs Chromium: 2 reads per question and 3 per write. A read typically takes 0.1-1 s and up to about 8 s on extreme pages.
- The accepted raised-badge limit stays.

Work: None. Optionally note the decision on the two F07 arbiter backlog rows.

##### 1B. Content layer, started now

The page builders put every reader-facing line in a marked place: an element named with a data-copy attribute that holds plain text. VOICE offers those places as labelled lines, the way C4's on-screen fields work. It writes your text into them exactly and checks it by reading them back. It then shows you the rendered page on a wide screen and a phone, and you keep it or edit again. No browser read decides the words.

Pros:

- Exact by construction. Words are never placed across links, flex items or formatting, which caused most of the 14 rounds.
- Every marked line is offered, including hidden ones like FAQ answers and phone menus.
- Retires page-arbiter.ts, the visitor read, most of page-copy.ts and their tests, along with the two F07 arbiter-limit backlog rows.
- Brings back the protocol's own human check (01 VOICE steps 7-8: insert verbatim, flag problems, skim). VOICE stays free and no longer needs Chromium.
- Cheap to do while the study registry is empty (registry.ts:23).

Cons:

- A weaker machine guarantee. byway would guarantee that the page's source holds your words exactly. Whether a visitor sees them as typed (CSS truncation, uppercase styling, a script that overwrites the text) rests on your look at the page and on C1's defect check after VOICE.
- It depends on models marking every line reliably, which has not been measured. Text left outside the marked places could not be edited.
- It must not edit the article.* prompts that Study 1's C1-H arm and the baselines share. So C1 needs its own product versions of them, and C1-H plus its five ablations get new hashes, because c1h.ts:30 derives its hash from C1's.
- Runs started before the change cannot do page VOICE.
- It is a new design that needs its own verification, with a risk of another long fix loop unless it is time-boxed.

Work: Size L, time-boxed, with each fix round approved by you.
- First, a small paid pilot: about 20 C1 page builds, a few dollars on Balanced, to measure how reliably models mark copy.
- New ADR. It replaces ADR-0081's page sections. The non-web copy decks, the total readers, the exact locks and "no model in VOICE" all stay.
- Prompts: product versions of article.SEED and article.CRIT-W for C1. Instructions to keep the data-copy places in runbook.cut-apply, runbook.tells-swap and a product version of helper.asset.integrate@web-page (C1-H uses that helper too). Demo-mode pages carry the places.
- Catalog: new prompt ids in c1.ts, and a loop you hold around VOICE and a render (check it against the PR6 VOICE lock). Regenerate recipes/c1*.json.
- Runner:
  - a small reader and writer for the marked places, built on html-tokens.ts;
  - human.ts's page path follows the non-web pattern, with no Chromium reads;
  - copy.ts's page lock becomes "the marked texts and link addresses are unchanged";
  - delete page-arbiter.ts, the visitor read in pages.ts, most of page-copy.ts, page-arbiter.test.ts, most of page-copy.test.ts, the visitor-read block of pages.test.ts (lines 403-1078) and the @tailwindcss/browser dev dependency.
- Web: optionally show page VOICE as labelled fields.
- Rules for a link inside a sentence: keep ADR-0081's bracket notation inside a marked place, or make each link its own place.
- Migration note: a run whose page VOICE is still ahead stops plainly at VOICE ("this page was built before byway marked its copy; start a new run"). Finished runs and stored pages are not affected.
- Composed web-page recipes must reuse the marking prompts.

##### 1C. Content layer, decided now and built at a set time (recommended)

Same design as 1B. You approve it now, and it is built as one time-boxed piece of work before Study 1's first registry entry, or earlier at the first trigger: the arbiter needs any fix (no round 15); a real run hits a line you need that is not offered, or a refusal no rewording fixes; or the workflow changes for another reason. Until then, 1A holds.

Pros:

- Nothing is broken today and both designs are free and fail-safe, so this is not an emergency.
- It lands while re-hashing C1-H costs nothing.
- It leaves time for the pilot, and can share a workflow change with VOICE-RETRY and the retirement of the voice.apply ids.
- No more effort goes into the arbiter from today.

Cons:

- The arbiter, and the 7% of lines it does not offer, stay for now.
- It adds a dated item to the list before Study 1.

Work: Now (small): record the decision and the triggers. That is one backlog row under "Before the study registry's first entry" and a line in the next ADR; ADR-0081 itself is not edited. Later: the work listed under 1B.

##### 1D. Retire only the browser arbiter; keep today's line reader; add your look at the page

Keep page-copy.ts's line reader and exact placement. Delete the Chromium arbiter and the visitor read. After VOICE, show you the rendered page so you keep it or edit again.

Pros:

- No page-format change and no prompt changes. Old pages still work.
- Retires about 2,300 lines of code and about 1,340 test lines.
- Hidden lines are offered again.

Cons:

- It keeps the 2,400-line model of HTML whose misreads the arbiter was built to catch. Round 6's verifier found about 440 of 1,500 generated pages read differently from Chromium.
- Words placed across links, flex items or formatting can show glued or split, as in "Sign intoday", and only your eyes would catch it.
- The look at the page still changes C1's recipe, so C1-H gets new hashes anyway.

Work: Medium: delete page-arbiter.ts, the visitor read and their tests; remove the Chromium reads from human.ts; add the VOICE-and-render loop to C1; write an ADR.

##### 2A. Keep case 2 as it is (status quo; recommended)

A composed recipe that puts your "what to remove" list last in an audit lens, or last in a final check's body, is refused. The composer has to place it elsewhere. No catalog recipe is affected.

Pros:

- It protects your "nothing to remove". In those shapes an empty answer is dropped, so the fix after would either apply an older critique you never asked for, or make a paid AI pass on an empty list under a prompt that opens "Dial this back".
- No work.
- Rare and only in composed recipes: 300 of 28,856 refused answers in the test corpora.

Cons:

- It refuses some shapes in which a non-empty list does reach the work every time.
- It costs the composer one of its two repair tries.

Work: None. Record the decision and remove the backlog row.

##### 2B. Narrow case 2 to audits a critique can come before

Admit the shape where no critique can come before the audit, as in the C1 variants.

Pros:

- A few more composed recipes are admitted.

Cons:

- In those recipes an empty answer still leaves the fix without the "Nothing to remove" mark. On main that means a paid model call with an empty list (interpreter.ts:345 skips only on that mark, and prompting.ts:174 fills a missing critique with empty text). The AI may then remove things you never listed.
- So the backlog's description of the C1 case as having nothing at all is not quite true.

Work: Small: add a "some critique can come before" condition to the two case-2 branches in structural.ts (lines 134 and 157), plus tests and an ADR line.

##### 2C. Fix it at run time, then drop case 2

Make an audit or a final check pass on your empty list as "Nothing to remove", the way it works outside them, so the fix after it skips. Then remove case 2.

Pros:

- Fixes the cause: "nothing" means nothing wherever you are asked.
- Admits all 300 answers.
- Also closes the backlog row about a gate passing on the wrong "Nothing to remove" mark.

Cons:

- It changes workflow code, so the workflow bundle hash changes and ADR-0078 ends open runs.
- It needs semantics and validator updates and oracle re-runs, all for a rare, composed-only shape.

Work: Medium: interpreter.ts audit() and gate(), semantics.ts answersReachingWork, structural.ts, tests and an ADR. Best done together with the next workflow change made for other reasons.

##### 3A. Confirm: an AI direction made from your answer carries it (status quo; recommended)

When an AI step takes your reaction in (for example the sharpening) and what it writes reaches the work, byway counts your answer as acted on and admits the recipe.

Pros:

- It matches the protocol and the catalog. C2's and C6a's VISION step is "you react, the AI sharpens a brief", so your reaction always reaches the work through an AI direction. The C2 variant's sharpened brief reached the option map in 32 of 32 runs.
- Composed explanations do not claim exact application. They say "Your turn: say what you want…" and "The AI offers directions".
- No code change.

Cons:

- Reaching the work here means influence through the AI's restatement, which can water down what you said.
- Refusals stay less strict than a writer-only rule would make them.

Work: Small: record the confirmation in the next ADR (ADR-0098 is append-only) and remove the backlog row.

##### 3B. Writer-only: count only a writer, your own draft or a decider that takes your answer in itself

A composed recipe whose answer reaches the work only through an AI direction is refused, as round 7 did.

Pros:

- Stricter: byway asks only for answers that something writing the work takes in directly.

Cons:

- Inconsistent: the same reaction is accepted as a taste (catalog C2 and C6a) but refused when it is also given as a critique.
- It refuses designs main has always admitted.
- Code changes and oracle re-runs for a handful of composed shapes.

Work: Small to medium: semantics.ts (carriesOn, answersReachingWork), validator and present tests, a re-run of the verification oracle, and an ADR.

##### 3C. Count it only where you see the AI's direction first

Admit the recipe only where the AI's direction is shown to you before it reaches the work: beside your own draft as in C6a, or in a loop you hold.

Pros:

- You can catch a distortion before it becomes the work.

Cons:

- A new rule in the shared semantics for a rare composed case.
- Catalog C2 already shows you each sharpened brief in a loop you hold, so the gain is small.

Work: Medium: a new reachability condition in semantics.ts, tests, oracle re-runs and an ADR.

##### 4A. One board per option (status quo)

If you opt in, byway makes one rough image for every option in the option map, up to 12.

Pros:

- No work.
- You get boards for the options you turned down, in case a team revisits them.

Cons:

- You are told "for the chosen option" and shown an estimate for 1-3 images, but up to 4 times as many are bought.
- For 12 images that is about $0.41 on Balanced, and up to about $2.90 on Best or OpenAI, against about $0.72 for 3.
- The boards come after you have decided, so boards for rejected options inform nothing.

Work: None. At the very least the explainer (presentation.ts:170) and the estimate (estimate.ts:237) should be made true, which is a small change.

##### 4B. Boards for the chosen options only, 1-3 (recommended)

One board per option you chose. The option map already lists those first and starts their rationale with "Chosen.".

Pros:

- It matches the trigger, the explainer, the estimate and the protocol: boards follow the decision and go with the chosen briefs into C1, C3 or C5.
- At most 3 images.
- Product-only: no research recipe uses C2, and C2's recipe hash does not change.

Cons:

- No boards for the rejected options.
- It relies on the option map's "Chosen." marker, so it needs a fallback, such as the first option.

Work: Small, and runner activity code only:
- product.c2.mood-boards v3, for the chosen options only;
- slot-plan.ts eachPlan for options plans only the options whose rationale starts "Chosen." (falling back to the first);
- the options slot in asset.ts lists only those;
- update the spec §3.3 sentence;
- tests: asset-slots, media-contracts and the C2 end-to-end test.

##### 4C. Exactly one board, for the first chosen option

A literal reading of "the chosen option".

Pros:

- Cheapest: one image.

Cons:

- C2 can end with up to 3 chosen briefs, and the second and third would get no board.

Work: Small: the same as 4B, with a count of one.

#### Recommendation

(1) Option 1C. Approve the content layer now as the planned replacement for the browser arbiter, but do not start it this week. Build it as one time-boxed piece of work before Study 1's first registry entry, or earlier if the arbiter needs any further fix (no round 15). Go ahead only after a small paid pilot shows that models mark copy reliably. Until then, keep the arbiter exactly as it is.

(2) Option 2A. Keep case 2. Look at 2C again only when the workflow changes for other reasons.

(3) Option 3A. Confirm that an AI direction made from your answer carries it to the work, and record that.

(4) Option 4B. Make mood boards only for the chosen options, 1-3 images.

#### Rationale

Safety and money.
- (1) Both page designs are free (no model call) and fail safe, so there is no urgency. The arbiter refuses rather than mis-writes. The content layer writes your words exactly and then asks you to look.
- (2) Keeping case 2 is the safe choice. Narrowing it (2B) would admit recipes where your "nothing to remove" turns into a paid AI pass that may delete things you never listed.
- (4) 4B stops byway buying up to four times the images it told you about. That is up to about $2.90 against about $0.72 on Best or OpenAI.

Research credibility (ADR-0043).
- The content layer must leave the article.* prompts alone. Study 1's C1-H arm and the baselines share them, and they are meant to be faithful transcriptions of the article's prompts. So C1 needs its own product versions.
- C1-H and its five ablations get new hashes, because c1h.ts derives its hash from C1's. That is free while the study registry is empty (registry.ts:23) and awkward afterwards. That is the main reason to schedule the work before the first registry entry rather than wait for trouble.
- Questions 2-4 touch no research recipe.

Small team, local app.
- The arbiter is about 4,500 lines of browser-imitation code plus about 2,600 test lines. It grew from an estimated 600 lines over 14 rounds and 110 commits, and it can break when Chromium or a CDN library changes.
- The content layer retires most of that and makes VOICE independent of Chromium.
- 1D keeps the hard part (the HTML reader) while removing the check that made it safe, so it is the worst trade.

Proportion.
- The arbiter is heavy machinery for rare layouts (vertical text, 3D transforms, mixed-direction scripts). The proportionate design is plain marked text plus your own look at the page, which is what the protocol's VOICE step already asks for.
- That design is not free to build, though, and the slot marking is unproven. Hence a decision now, a pilot and a time box, not an emergency rebuild.
- (2) and (3) are rare and composed-only. 2A and 3A need no code and match how the catalog already behaves; 2C and 3B would spend a workflow change or oracle re-runs on a few generated shapes.
- 3A is also the only consistent reading: the catalog's own C2 and C6a pass your reaction to the work through an AI-sharpened brief.

#### Evidence

Read on main at 07d428e, read-only. Nothing was run and no paid calls were made.

Sources:
- docs/backlog.md:80 (C2 boards), :104-105 (the ST9/ST10 and direction questions), :112-113 (the content-layer proposal and the arbiter-limits policy), :125 (the two "(backlog)" items).
- docs/reviews/2026-10-16-review-fix-status.md:40-49.
- docs/reviews/2026-10-08-external-review-verification.md §4 and cluster E, Recommendation A ("page-copy.ts is about 600 lines").
- docs/adr/0081-voice-writes-the-persons-copy-exactly.md:
  - header: the owner ended the work after one bounded round 14 and accepted the raised-badge case;
  - line 59: 1,527 of 1,637 lines offered, 8,556 of 8,609 answers stored, 27 refused by the reader and 26 by the arbiter;
  - line 60: 110 lines not offered, by reason;
  - line 108: 2 reads per question and 3 per write, with timings.
- docs/adr/0098-recipe-limits-disclosure-and-held-voice.md: line 98 (the case-2 text), line 116 ("the owner is still to confirm it"), lines 142 and 154 (300 case-2 answers, 136 ST9 and 164 ST10).
- docs/adr/0043 and docs/adr/0041 (studies pin their versions; paper claims cover only the pinned versions).

Code:
- Code sizes: page-copy.ts 2,403, pages.ts 2,177 (shownText starts at line 609, the visitor-read scripts run from about line 723 to 2105), page-arbiter.ts 779, html-tokens.ts 278. Tests: page-arbiter.test.ts 663, page-copy.test.ts 1,278, the visitor-read block of pages.test.ts (lines 403-1078).
- `git log main | grep F07` gives 110 commits, dated 8-16 Oct.
- shownText is used only by VOICE (human.ts:135, 142, 385; page-arbiter.ts:297, 778).
- Prompts shared with research: steps.ts:15-27 (seedBuild uses article.SEED), steps.ts criticFix (article.CRIT-W), and asset.ts:139 (helper.asset.integrate for every web-page ASSET). The C1-H hash derives from C1's at c1h.ts:30. STUDY_REGISTRY is empty (packages/advisor/src/registry.ts:23).
- Case 2: structural.ts:29, 134-135 and 157-158; interpreter.ts:345, 461, 745-756 and 820-827; prompting.ts:174; runbook.cut-apply.md opens "Dial this back".
- Direction question: semantics.ts:1118 (carriesOn) and 1215 (answersReachingWork); catalog c6a.ts and c2.ts, where a reaction yields a taste and an AI sharpening makes the brief; presentation.ts:159 and :380; present.ts COMPOSED_EXPLAINERS.
- C2 boards: c2.ts:62; presentation.ts:170; product.c2.mood-boards.md (v2, "images: each"); slot-plan.ts:36-40; asset.ts:264; estimate.ts:95 and 237; product.c2.option-map.md:32-33 ("Chosen." first).
- Image prices: gateway/src/prices.ts and profiles.ts. Balanced uses gemini-nano-banana-2.1 at $0.0336 per image. Best uses gpt-image-2.5-sunburst and the OpenAI profile uses gpt-image-2.5-flare, both with a planning bound of 8,000 output tokens at $30 per million, about $0.24 per image.

Background design notes are outside the repository in C:/Users/arvik/AppData/Local/Temp/byway-fixes/designs/: semantics-2-final-r9.json, semantics-2-final-r11.json and final-recheck.json.

### The skeptic

**Does the recommendation hold?** No.

#### Weaknesses

- (1) The case for building on a schedule rests on one claim: re-hashing C1-H is free now and awkward later. That claim is weaker than stated. ADR-0041 already requires a frozen study to pin its recipe versions so the product's C1 can keep changing. Today c1h.ts:30 computes C1-H's parent hash from the current C1, so it must be pinned at Study 1's freeze whatever happens to VOICE. C1 will change for other reasons too: its own title in c1.ts says 'vision routes and RELAY not yet modelled'. Once C1-H's parent is pinned, the content layer has no Study 1 deadline. Study 1 is also far off. docs/study1/protocol-v1.1-draft.md:3 says it is 'not registered, and not yet ready for Stage 0', and the article.* prompts are still to be transcribed word for word (decision D2), which will change them anyway.
- (1) The pilot is too small and priced too low. Copy marks must survive up to 5 critic-fix rewrites per candidate, plus the image placement, CUT and swap rewrites. Each of those rewrites the whole page. 'About 20 page builds for a few dollars' only tests the first build. byway's own advisor gives a C1 run on Balanced as $1.14-$5.87. I computed this in demo mode with fake keys; no calls were made. So 5 full C1 runs (20 candidate pages) cost about $6-30, and 20 runs about $23-117. Also, 20 pages with no misses only shows the per-page miss rate is probably under about 15%.
- (1) The pilot measures only the new design. The 7% gap and the 53 refusals come from 46 pages the fix rounds wrote to stress the arbiter: Tailwind's browser build, GSAP, Alpine, right-to-left Arabic and Hebrew, vertical Japanese, turned and 3D-tilted boxes. None was taken from C1's own output. Asking today's page VOICE question on the same real pilot pages adds no model cost. It would show whether there is a problem big enough to justify a size-L rebuild.
- (1) The size-L estimate for 1B is optimistic. This same area was estimated at about 600 lines (verification report, line 2161) and became about 4,700 lines over 14 rounds. The same report rated the closely related 'segment identities end to end' design XL (line 2174). The 1B work list also misses three things. First, words that live in attributes: alt text, aria-label, placeholders, button values and the meta description. Neither design offers these today. Second, a styled word inside a line, such as a gradient span on one word of a headline, which model-made pages use a lot. A plain-text place forbids it, so it limits C1's designs. That is a quality cost, and a pilot comparing quality with an AI judge would be a CR3 product evaluation needing a Program Registry entry first (ADR-0046). Third, product C1 would no longer run the article's build prompts. That should be recorded as carrying out 01 VOICE's ⟨A⟩ COPY-PLACEHOLDER step (protocol/01-blocks.md:575), because ADR-0017 keeps C1 faithful to the article.
- (1) The 1B con 'text left outside the marked places could not be edited' overlooks a cheap guard. Text outside a marked place can be found in the page source with html-tokens.ts, with no Chromium needed, and offered as a line of its own. With that guard, an unreliable model gives worse labels, not uneditable words.
- (1) 1D is called 'the worst trade' on old numbers. It needs no prompt, recipe or hash change, no migration and no pilot. It retires about 2,300 code lines and 1,340 test lines. Its con 'the look at the page still changes C1's recipe' is not forced either: the look can be built into the VOICE question flow in the runner rather than added as new recipe steps.
- (1) Keeping the arbiter, even for a while, has a maintenance risk the brief misses. All of its evidence lives outside the repository, in C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/runner-copy/r13 and r14: the 46-page corpus, the generators and the oracles. Windows can clear Temp, and nothing reruns those checks.
- (4) 4B finds the chosen options by the 'Chosen.' at the start of each Rationale. But the person's VOICE runs just before the mood boards (c2.ts: voice, then mood-boards-if-wanted), and it offers Title, Pitch and Rationale for rewriting (C:/Users/arvik/code/byway/packages/runner/src/copy.ts:81). If the person rewrites a rationale, that option silently loses its board. The fallback then makes only one board.
- (4) The brief counts the money but misses the budget stop. The run's default budget is suggestBudget(estimate) (apps/web/src/components/RecommendationView.tsx:377; apps/web/src/view/format.ts:64-66). For C2 on the OpenAI profile the high estimate is $1.79, so the default budget is $2.50, yet 12 boards set aside about $2.90 by themselves. On Best the default is $3.50, and the low estimate of $0.81 plus 12 boards at $0.24 is about $3.71. So on those profiles, a run that opts in with about 10-12 options stops at the mood boards to ask for more money, for images it was told would number 1-3. This makes the case for 4B stronger.
- (3) The '32 of 32 runs' check ran byway's engine with every activity stubbed. It shows the sharpened brief reaches the option map. It does not show that a real model's sharpening keeps what the person said. Also, carriesOn (semantics.ts:1118) covers any AI step that writes its own text from the answer: a critic, a check, an AI CUT list, a sweep, an overlap flag or a direction. The owner would be confirming that wider rule, not only 'AI directions'.
- (2) The brief does not say plainly what 2A costs. The 300 case-2 answers are the only refused answers among the 28,856 that would reach the work when given (ADR-0098, round 10). All the others reach nothing. 2A is still right, but the owner should know it.

#### Factual errors

- The trigger 'before Study 1's first registry entry' and the claim 'free while the study registry is empty (registry.ts:23)' name the wrong milestone. STUDY_REGISTRY (C:/Users/arvik/code/byway/packages/advisor/src/registry.ts) holds the evidence labels and gets an entry only once a study reports. C1-H's hash is fixed much earlier. Protocol v1.1 (docs/study1/protocol-v1.1-draft.md:33-37) registers the C1-H recipe hash at 'Prompt registration', before the first paid call that runs any study prompt, and freezes it before the pilot runs. CR3 (ADR-0046) also needs a Program Registry entry with recipe hashes before the first paid call. A trigger tied to registry.ts would fire after the hash is already frozen.
- 'The article.* prompts that Study 1's C1-H arm and the baselines share' is wrong for the baselines. They use article.B1 and article.B2 (packages/catalog/src/baselines.ts:26-53), which are not in byway's prompt library at all. No baseline uses any page-building prompt the content layer would change.
- 'The way C4's on-screen fields work' is wrong. The on-screen deck (Headline, Tagline, Shot N) belongs to C5's late VOICE (c5.ts:31-42; copy.ts). C4 is prose.
- 1B's pro 'VOICE ... no longer needs Chromium' does not match the same design. 1B shows you the rendered page on a wide screen and a phone, which means two Chromium renders for each VOICE round. It removes the visitor reads, not Chromium.
- 1D's con 'Round 6's verifier found about 440 of 1,500 generated pages read differently from Chromium' describes the reader as it was in round 6, eight fix rounds ago. On round 14's code the arbiter refused 26 of 8,609 answers on the realistic pages (0.3%) and 107 of 7,200 generated edits (1.5%) (ADR-0081). Those are the cases 1D would leave to the person's eye.
- '110 of 1,637 lines ... you cannot write' (about 1 in 15), set against 1B's 'every marked line is offered', overstates the gain. 37 of the 110 are words a script makes or changes: 33 count-ups, countdowns, price toggles and typed phrases, and 4 lines a script rewrites (ADR-0081:60). Those words live in script strings, so a data-copy element does not make them writable either. The content layer could recover about 73 lines, about 4.5%, on pages built to stress the arbiter.
- The 1A con about 'Chromium, Playwright ... changes' is overstated. Playwright is pinned to an exact version (packages/runner/package.json: "playwright": "1.63.0"), so browser changes arrive only with a deliberate upgrade. The live risk is the CDN libraries fetched afresh at every read, such as Tailwind's browser build. Those also make page VOICE depend on the network.
- The 2B con says the backlog's C1 description 'is not quite true'. The backlog and ADR-0098 say that where no critique can come before the audit 'there is none', meaning no older critique, and that is true. The brief's real point stands: the fix still makes a paid call with an empty directive. The backlog is incomplete, not false.
- 4B's pro says the boards 'go with the chosen briefs into C1, C3 or C5'. The product does not do this. The c2.ts docstring lists 'feeding C1, C3 or C5 as their front end' under 'Not modelled'. The boards stay beside the option map.
- 4B's 'At most 3 images' is not enforced anywhere in code. 'One to three' appears only in the prompts (product.c2.sharpen.md, product.c2.option-map.md). A person who favours five options can get five 'Chosen.' entries and five boards.
- The 1B pro 'brings back the protocol's own human check (01 VOICE steps 7-8)' misreads the protocol. Step 7 has the agent insert the copy exactly and flag layout breaks. Step 8's skim test checks that the point lands, not that the words were placed right. A person looking at the page is a byway addition.

#### Missing options

- 1E: edit the page's source text directly. Offer each run of text between tags as its own line, with the title included and scripts and styles left out. Write each one back in place, then show the rendered page. There is no prompt, recipe or hash change, so it has no Study 1 deadline, and old pages keep working. Hidden lines such as FAQ answers and phone menus are offered. It is built on html-tokens.ts, which is 278 lines. Cons: a sentence with a link or a styled word splits into several fields, words a script makes are still not covered, and only your eye checks the result.
- Pin C1-H's parent hash at Study 1's freeze, as a literal value or a frozen copy of C1. ADR-0041 requires this anyway. After that, no later change to the product's C1 touches C1-H, this one included. It does not change C1-H's hash.
- If the arbiter stays, even for a while: copy its 46-page corpus, generators and oracles from %TEMP% into the repository, and run them before any Playwright upgrade. This is small work.
- A content layer with a fallback: any text the model leaves outside a marked place is found in the source and offered as its own line. This makes the design complete in the source even when marking is imperfect.
- 2D: an activity-only guard in packages/runner/src/activities/model-step.ts. A fix that takes in a critique and has none, or an empty one, asks no model and passes, as 'Nothing to remove' already does. The workflow bundle does not change, so ADR-0078 ends no runs. It removes the paid 'Dial this back' call with an empty list wherever one can happen, including the declined-optional-CUT case already in the backlog. Case 2 is still needed for the case where an older critique exists. It needs a check that no admitted step relies on a fix running without a critique.
- 4D: keep one board per option, but make the words and the estimate true. The estimate would count the options, and the explainer and trigger would say 'for every option'. This is the minimum honesty fix, and the brief lists it only as 4A's work.
- A sturdier 4B: mark the chosen options with an optional 'chosen' flag in the option map, added to the schema in packages/runner/src/formats.ts:113-119 the way imageArtifactId already is. VOICE does not offer that flag, so the person's rewrite cannot remove it. The alternative is to read the map as the option-map step wrote it. Cap the boards at 3, with a note naming any chosen option left without one.

#### Revised recommendation

(1) Not 1C as written. Keep the browser arbiter as it is (1A) and put no more work into it: no round 15, and known limits stay unfixed. Do not approve a replacement design yet. Do two small things now. First, copy the arbiter's 46-page corpus, generators and oracles from C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/runner-copy/r13 and r14 into the repository, so they survive and can be rerun before any Playwright upgrade. Second, record 1C's triggers in the backlog: any arbiter fix needed, a line you need that is not offered, a refusal no rewording fixes, or a workflow change made for another reason. Separately, at Study 1's freeze, pin C1-H's parent hash. ADR-0041 needs that anyway, and it means no change to the product's C1 can touch C1-H. When a trigger fires, run one pilot on real C1 output through the whole pipeline: about 5 C1 runs, roughly $6-30 on Balanced by byway's own estimate. It should measure two things on the same pages: how many lines today's question leaves out, and how well models mark copy and keep the marks through the critic, image, CUT and swap rewrites. Make it a mechanical count, not a quality comparison by an AI judge; a comparison would need a CR3 registry entry first. Then choose between the content layer (with a fallback that offers any unmarked text as its own line), the source-text editor (1E), and 1D. If you want the content layer now for maintenance reasons alone, the deadline is Study 1's prompt registration and freeze, not the study registry's first entry, and the full-pipeline pilot still comes first.
(2) 2A holds: keep case 2, record the decision and remove the backlog row. Optionally add the small activity-only guard (2D), so a fix with no critique never makes a paid call.
(3) 3A holds: confirm it in the next ADR. Record the rule as written: any AI step that writes its own text from your answer carries it on, not only AI directions. Note that the 32-of-32 result checked the engine's plumbing, not how faithfully a real model restates your words.
(4) 4B holds, with a sturdier design. Decide the chosen options from something your VOICE cannot edit: an optional 'chosen' flag in the option map, or the map as the option-map step wrote it. Do not rely on the 'Chosen.' at the start of a rationale that VOICE offers for rewriting. Cap the boards at 3, with a note naming any chosen option left without one. Change the explainer to 'the chosen options'. The strongest reason for 4B is the budget, not the dollars: on Best and OpenAI the default budget is $3.50 and $2.50, and 12 boards set aside about $2.90 by themselves, so today such runs stop at the mood boards to ask for more money.

#### Reasoning

I checked every claim against main at 07d428e, read-only. I ran only one thing: byway's own advisor estimate, in my worktree with fake keys and no network calls.

Most of the brief's description of today's code is right. The file sizes are right. The page VOICE flow in human.ts is right: 2 Chromium reads per question, 3 per write, no model call. So are the round-14 figures, the 110 F07 commits, ST9 and ST10 case 2 (structural.ts:134 and 157), the run-time cause (interpreter.ts:345 and 745-756, prompting.ts:174), carriesOn and answersReachingWork, the C2 board count (c2.ts:62, presentation.ts:170, estimate.ts:95 and 237, slot-plan.ts), and the image prices.

Questions 2 and 3 survive scrutiny. Each recommendation keeps the status quo, matches how the catalog behaves, costs no code and touches no research recipe.

Question 4's direction survives too. The trigger, the explainer and the estimate all promise boards for the chosen option, and the runner buys one for every option. But the brief's own design reads the 'Chosen.' marker from a field that the person's VOICE offers for rewriting one step earlier. It also never enforces the 1-3 limit. And it misses the strongest reason for 4B: with byway's default budget, a C2 run on Best or OpenAI can stop at the mood boards to ask for more money.

Question 1 does not survive as recommended. Its timing argument names the wrong milestone. STUDY_REGISTRY gets its first entry only when a study reports, while C1-H's hash is registered and frozen before Study 1's first paid call. The argument is also avoidable: C1-H's parent hash has to be pinned at the freeze anyway under ADR-0041. That leaves the product case. The arbiter is working, fails safe, costs nothing to run, and serves one step of one catalog recipe. Its gap is measured only on 46 pages written to stress it, and about a third of that gap is script-made text that the content layer would not fix either. Under the owner's priorities, the proportionate move is to stop work on the arbiter, protect its evidence, and decide on a replacement only when there is a reason, using data from real C1 pages. Those priorities are research credibility first, a small team running a local app, and proportion. The other choices in that decision are the content layer, 1D, and a source-text editor the brief did not list.

The 1B effort figure (L) and the pilot price ('a few dollars') are optimistic. The history here is about 600 estimated lines that became about 4,700, and the verification rated a related design XL. Testing whether marks survive needs full C1 runs, which byway itself estimates at $1.14-$5.87 each on Balanced.

Files consulted:
- C:/Users/arvik/code/byway/packages/advisor/src/registry.ts
- C:/Users/arvik/code/byway/docs/study1/protocol-v1.1-draft.md
- C:/Users/arvik/code/byway/docs/adr/0041-shared-engine-pinned-research-versions.md
- C:/Users/arvik/code/byway/docs/adr/0046-public-program-registry-gates-spend.md
- C:/Users/arvik/code/byway/packages/catalog/src/c1h.ts
- C:/Users/arvik/code/byway/packages/catalog/src/baselines.ts
- C:/Users/arvik/code/byway/packages/catalog/src/c2.ts
- C:/Users/arvik/code/byway/packages/runner/src/copy.ts
- C:/Users/arvik/code/byway/packages/runner/src/formats.ts
- C:/Users/arvik/code/byway/packages/runner/package.json
- C:/Users/arvik/code/byway/apps/web/src/view/format.ts
- C:/Users/arvik/code/byway/docs/reviews/2026-10-08-external-review-verification.md
- C:/Users/arvik/code/byway/docs/adr/0081-voice-writes-the-persons-copy-exactly.md
- C:/Users/arvik/code/byway/docs/adr/0098-recipe-limits-disclosure-and-held-voice.md

The estimate script is at C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/decisions/skeptic-new/est.mts.

