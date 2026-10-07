# vision
VERDICT: The product-vision bullets point the right way. As written, though, they would either force a rewrite later or let the product borrow credibility from the research. The draft names a "block registry", a "recipe validator" and "evidence labels" but does not say what any of them contain. It also misses four things:

1. Several port rules can only be enforced while a run executes, not by a static graph check.
2. Some Study 1 arms break rules on purpose, and that is the experimental manipulation: CRITIC-self breaks default rule 3, and D3-auto on unpicked candidates breaks port rule 4. Without a separate class for these, a composer could "declare" its way past any rule.
3. Paper 1 studies C1-H, a headless C1 with a fixed copy deck and policy-bound checkpoints. A product C1 with live humans can never honestly carry the label "Studied" from it.
4. The protocol itself (05 §B) classifies "an LLM assembling the legos itself" as off-path, "a different system". The user's north star ("build one based on the user's need") therefore crosses the ADR-0003 scope rule, and that needs its own ADR.

**What the shared engine must own from day one:**
- An immutable registry of blocks, glue and prompts, addressed by content hash.
- Typed ports, with rules written per role and enforced both statically and at runtime.
- A versioned ruleset, with stable rule IDs and three classes of exception.
- One canonical recipe format with kinds, lineage, bounded loops and transform-derived ablations.
- Model and checkpoint bindings kept out of the recipe structure and counted as part of the evidence scope.
- Registry channels plus a provenance gate in the study lock.
- A conformance suite that the lock depends on.

**What stays in the product layer:** the recommender, the composer and the UI. They may emit recipes only through the engine's validator, and their output gets labels the engine computes; no one can override those labels.

**Cost:** most of the day-one work is needed for Paper 1 anyway (lock, manifests, ablations, code enforcement of port rules per the ADR-0011 follow-up, cost estimator). My rough estimate, not measured, is about 10–15 extra engineer-days, taking the planned ~4-week harness spine to roughly 6–7 weeks. Deferring the product-only fields (kind, lineage, channel, role, status) is possible. The price is a recipe-hash schema migration later, while studied conditions are identified by those hashes.

**Prior art:** ADAS, AFlow, DSPy, MaAS and WorFBench point toward a declarative, validated recipe format, choosing among canonical configurations before composing new ones, and never optimizing frozen block prompts. Optimizer gains on fixed evaluation sets often fail to transfer (Wang et al. 2026), which argues for held-out problem sets and regression control when the recommender and composer are evaluated later.

**More to explore (parked, off-path):**
- Quality-diversity or MAP-Elites search over the space of valid recipes (related to QDAIF in 05 §A).
- A recommender learned from product usage logs (only with separate consent and a separate preregistration).
- LLMs assembling or changing configurations at runtime (05 §B).
- DSPy- or GEPA-style optimization of block prompts (conflicts with frozen prompts and with 05 §H's averaging warning).
- MaAS-style query-dependent architecture distributions.
- Information-flow type systems that could formally prove the port rules.
- A third-party block marketplace with signed blocks and supply-chain checks.
- Full RO-Crate or PROV interchange beyond the replication package.

## [fatal] Capability: a versioned block registry. Blocks, glue adapters and frozen prompt templates are stored as immutable entries addressed by content hash, which composition, ablation and study locks all reference.
- GAP: The draft promises 'typed blocks with port contracts, versioned' but leaves four gaps:
- It never says what a block version contains or what is immutable.
- It never says how glue (RENDER, BRIEF, TIER, KEYS, BANK, dedupe) and frozen prompts are versioned. ADR-0007 notes that glue affects results but is not ablated.
- It never says how a study refers to a block, as opposed to a recipe.
- CC2 hashes 'recipe versions, prompts' but not block or glue versions, so a block could change under an unchanged recipe file.
- FIX: Each registry entry holds a block code, a semver label and a SHA-256 hash of its canonical definition. The definition covers:
- role and port signature (in and out types);
- knobs, each with its article default, allowed range and an ⟨A⟩ flag;
- guards;
- frozen prompt templates (by hash), with their fillable slots declared;
- sit-out and bypass semantics (what passes through when the block is removed);
- its row in the wiring-compatibility table;
- evidence level and status.

Glue adapters are registered too, as kind=glue. They are never counted as blocks and never ablated unless that is declared.

Published entries are immutable: any change is a new version (SemVer rule). Entries are deprecated, never deleted, so every studied version resolves for the life of the paper.

Studies pin by hash. The product may follow semver ranges, but every run manifest records the hashes it actually used.

The minimum day-one form is a versioned directory of definition files in the repo plus a hash index. No service is needed.
- ENF: system | COST: About 1–2 engineer-days beyond the registry the lock already needs: role, range, status and bypass fields, and registering glue. If skipped, adding these later means re-hashing every block and changing the identity of conditions that were already studied.
- SRC: https://semver.org/; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0007-eight-block-codes-anatomy-and-glue.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0029-temporal-runner-versioned-recipe-files.md

## [fatal] Capability: typed ports and port rules written over roles and data labels, enforced both statically on the recipe graph and at runtime in the interpreter and gateway.
- GAP: The draft's validator reads as a static graph check only. Several hard rules are dataflow properties that a static check cannot prove:
- P2: the threshold never enters a critic prompt.
- P3: seeds and credentials never enter the artifact.
- P6: human voice is locked.
- P7: the tell catalog never enters generation or critic prompts.

ADR-0011 says these rules are 'enforced by following the runbook, not by code'.

The rules are also written against block names ('critics see views'). Every new judge-like block (VERIFY, a PairS-style picker) would then need interpreter changes, which blocks the lego-set growth the user wants.
- FIX: 1. Port types become first-class, including generics (option_set<T>) and data labels: secret (cred), tainted (seed, tells), locked (voice), hidden (score/threshold).
2. Each registered block declares a role: producer, judge, auditor, picker, gate, human, verifier or glue. Port rules are written over roles and labels. For example: any role=judge receives only view or refs, and no secret or tainted label may reach an artifact-typed output.
3. Static layer: the validator checks edges, generic parameters and the role/port rules.
4. Runtime layer:
   - the interpreter builds every model prompt only from registered templates plus typed port values;
   - the gateway refuses any call whose payload carries a label not allowed for the caller's role (tracked by hash);
   - locked voice spans are diffed after every later step.
5. Each run manifest stores a rule-audit record.
- ENF: system | COST: The ADR-0011 follow-up already requires code enforcement of rules 1, 2, 5 and 7 for Paper 1. The role and label abstraction adds about 2–3 engineer-days.
- SRC: https://arxiv.org/abs/2310.03714; https://www.commonwl.org/v1.2/Workflow.html; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0011-typed-ports-and-hard-port-rules.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/02-grammar.md

## [fatal] Capability: a versioned ruleset with stable rule IDs, and exceptions that come from a catalog in three distinct classes. This is what lets a validator accept the protocol's own configurations and Study 1's arms while refusing a composer that tries to declare its way past rules.
- GAP: The draft lists 'default rules and declared exceptions' as one category. It does not separate three different things:
- (a) protocol-declared exceptions: the 03 table, backed by ADRs;
- (b) deliberate rule breaks that are the experimental manipulation: CRITIC-self breaks default rule 3, and C1-H's D3-auto on unpicked candidates breaks port rule 4, which ADR-0034 notes is still undeclared;
- (c) invariants that can never be relaxed: credentials (P3), no detector metrics (P8), preserved disclosures.

If recipes can declare exceptions inline, an LLM composer can relax anything.

The rules being encoded (ADRs 11 and 13) are also only accepted by continuation, not ratified.
- FIX: The ruleset is a versioned artifact containing:
- port rules P1–P8;
- default rules R1–R10;
- the ordering principle;
- the wiring-compatibility rows;
- the sit-out table.
Each rule has a stable ID and a class: invariant, hard or default.

Recipes cite exceptions only by ID from an exception catalog. Each catalog entry records the rule ID, scope, reason, ADR link, an ⟨A⟩ flag and a composable yes/no. Recipes never write new exceptions inline.

Class (b), study manipulation, is legal only in research-channel recipes bound to a locked study, and the paper labels it as such.

The validator returns pass, pass-with-exceptions (with the list) or fail, and that verdict is stored in the manifest.

Ruleset v1.0 is the ratified set, and every study lock pins the ruleset hash. The minimum day-one form is rules as code functions with IDs plus the catalog as one data file.
- ENF: system | COST: About 1–2 engineer-days. It also forces ratification of ADRs 11 and 13 and the 03 exceptions table before the lock, which the ADR log already lists as an open decision.
- SRC: file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0013-default-rules-with-declared-exceptions.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0034-headless-c1-confirmatory-arm.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/03-configurations.md

## [fatal] Capability: one canonical recipe format that can be composed programmatically. Recipes are static, canonically hashed, and carry a kind, lineage, bounded loops and transform-derived ablations.
- GAP: The recipe format is still open (ADR-0029 follow-up: JSON or typed YAML). The draft hashes recipe files but never defines:
- canonicalization, so whitespace or key order can change a hash while the meaning stays the same;
- recipe kinds, so the baselines (B-Plain, B-Random, B-Skill) have no valid kind because they are not grammar configurations;
- lineage;
- references to sub-recipes (a configuration used as a block, e.g. C2 > C1);
- how an ablation is derived;
- whether the graph may change at runtime.

Cost estimation is planned per configuration rather than computed from the recipe.
- FIX: One JSON format is the single source of truth. YAML or the UI may author it, but it is always compiled. The hash is SHA-256 over RFC 8785 canonical JSON, with the schema version included so later schema extensions leave old hashes valid.

Required fields:
- kind: protocol-config, variant, ablation, baseline, composed or experimental;
- an ID namespace: C-numbers are reserved for protocol configurations (ADR-0019), and composed recipes get their own namespace;
- parent hash and derivation: authored, variant, ablation-transform or composed (with the composer version);
- block instances by registry hash;
- typed edges;
- operators from the grammar set only;
- checkpoint declarations (who holds taste and who holds voice), with no binding;
- sit-outs with reasons;
- exception catalog references;
- a max on every loop, or a human gate with a stated per-round cost;
- budget inputs, so the 02 §7 cost estimator is a function of the recipe plus a price table;
- success criteria judged outside the loop, with detector metrics rejected;
- sub-recipe references by hash, with a typed OUT port.

Template and bound instance get separate hashes.

The interpreter has no API for changing the graph at runtime. Only the declared route, loop, backtrack and retry operators can change the path.

Ablations come from a versioned transform ('remove block X using its registered bypass'), not from hand edits.
- ENF: system | COST: About 2–3 engineer-days beyond the 2-day format spike ADR-0029 already plans. Most of it serves Paper 1: arm identity, reproducible ablations and the ADR-0026 cost estimator.
- SRC: https://www.rfc-editor.org/rfc/rfc8785; https://www.anthropic.com/engineering/building-effective-agents; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0029-temporal-runner-versioned-recipe-files.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0019-variants-get-their-own-numbering.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/research/2026-10-06-harness-research/architecture.md

## [fatal] Capability: model, tier and checkpoint bindings are kept separate from recipe structure. They are supplied by the run context, and they are part of the scope that any result covers.
- GAP: Draft rule (1) locks the engine and recipe versions, and ADR-0041 proposes four checkpoint modes. The draft does not say:
- whether model IDs live inside the recipe;
- that the binding mode changes what a result means.

Paper 1's C1-H binds every ?H to a preregistered policy, uses a fixed copy deck, and has no VISION and no pick. The product's C1 binds to live humans. If bindings are not first-class, the product can run 'C1' and inherit C1-H's evidence.
- FIX: Recipes declare roles with a tier and family constraints, e.g. judge: big, family different from the worker's.

Two separate artifacts, each hashed and recorded in every manifest:
- a model profile: pinned IDs, provider route and effort (per ADR-0038);
- a checkpoint binding map: live, policy, AI-proxy or replay, per checkpoint.

The validator checks family constraints against the profile.

The evidence scope of any finding is the tuple (recipe hash, ruleset hash, model-profile hash, binding-map hash, task domain and set, outcome measure).
- ENF: system | COST: About 1 engineer-day beyond the pinning ADR-0038 already plans.
- SRC: file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0041-shared-engine-pinned-research-versions.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0034-headless-c1-confirmatory-arm.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0038-model-selection-pinning-and-routing.md

## [fatal] Capability: registry channels and a provenance gate in the study lock, so composed or product-tweaked recipes cannot enter a confirmatory study or be presented as protocol configurations.
- GAP: CC3 separates the data stores, and CC2 refuses conditions that are not in the lock. Nothing stops the same small team from putting a composed or product-optimized recipe into a lock, for example a product-tuned 'C1' in a later study, or from giving one a C-number. Results 'flow one way', but no mechanism enforces the direction.
- FIX: The registry has four channels:
- protocol: canonical, ADR-governed;
- research-frozen: immutable, referenced by locks;
- product;
- workspace/composed.

A study lock resolves only research-frozen entries. It refuses any entry whose lineage includes a composed or product derivation, unless that recipe was promoted. Promotion requires an ADR, the 03 ten-step contract, a new ID and preregistration as a new arm.

The lock records the full lineage chain, using PROV-style derivation.

The product channel may read protocol and research entries but never write to them. Writing to them requires an ADR-linked commit. The minimum day-one form is a channel field plus the lock check.
- ENF: system | COST: About 1 engineer-day.
- SRC: https://www.w3.org/TR/prov-overview/; file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/05-more-to-explore.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0041-shared-engine-pinned-research-versions.md

## [fatal] Capability: a validator conformance suite run against the canonical configurations and the Study 1 arms, with the study lock depending on it. Diagrams and notation are generated from the recipe files so the protocol documents cannot drift.
- GAP: The draft adds a validator with no acceptance test. The protocol files are maintained by hand and already drift:
- the operator count reads 13, 16, 17 or 22 depending on the file;
- the map is synced by hand;
- the verification pass still found unmarked ⟨A⟩ additions.

One defect is live today: C1-H's D3-auto on unpicked candidates violates port rule 4 with no declared exception. Nothing in the charter would catch it before the lock.
- FIX: Golden tests:
- C1–C7 and C6a must validate with exactly the exceptions listed in 03's table.
- Every Study 1 arm validates under its kind (baseline, ablation or study manipulation) with its listed exceptions.
- Deliberately broken fixtures must fail with the expected rule ID.

Notation and mermaid diagrams are generated from the recipe files. ⟨A⟩ marks are emitted from registry flags, so the article-faithful C1 can be computed by filtering out ⟨A⟩ items, as ADR-0017 promises.

The lock refuses to run unless the suite passes on the pinned ruleset. Paper 1's arms are required on day one; recipe files for C2–C7 can follow before the product launches.
- ENF: system | COST: About 2–3 engineer-days for the C1 family and the 9 Study 1 arms. About 2 more for C2–C7, which can trail Paper 1.
- SRC: file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0017-mark-additions-keep-c1-article-faithful.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/README.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0034-headless-c1-confirmatory-arm.md

## [major] Capability: evidence labels computed from lineage and a claims registry, with no override, so the product can only claim what a study measured, in the scope it was measured.
- GAP: CC7 defines three labels (Studied / Research-grounded but untested / Composed-experimental), but they are asserted by people, not computed. It leaves four gaps:
- No rule says when 'Studied' lapses after a change.
- Paper 1's findings are per contrast (C1-H vs B-Plain; −SEED vs C1-H), while the labels are per recipe.
- Null and equivalence results have no place. If −ASSET turns out equivalent, nothing stops a claim that ASSET helps.
- A live-human product C1 shares a name with, but is not, the studied C1-H.

Spin, meaning reporting that fails to reflect the range of findings, tends to favour the author's interests. Here the same people sell the product.
- FIX: The claims registry is engine data, written only from the research channel and only after publication. Each record holds:
- the study ID and DOI;
- the contrast;
- the evidence-scope tuple;
- the outcome, with its estimate and CI;
- a verdict: supported, null, equivalent, harmful or inconclusive.

The label function:
- Studied: only on an exact scope match with a registry record.
- Derived-from-studied: plus an automatic list of differences, e.g. 'live human checkpoints vs. policy; generated copy vs. fixed deck'.
- Research-grounded-untested: every block is an admitted protocol block.
- Composed-experimental: any composed derivation in the lineage.
- Experimental: any block that has not been admitted.

The product UI and every external claim show the computed label and an automatically generated scope sentence, in the spirit of a model card's evaluation conditions. No override flag exists.

Process: every public claim cites a claims-registry record ID. An independent reviewer (the CC4 co-investigator or statistician) checks claims copy before launch and then on a regular schedule.
- ENF: system | COST: About 3–4 engineer-days for the registry and label function, plus a light review step per release.
- SRC: https://pmc.ncbi.nlm.nih.gov/articles/5856510; https://arxiv.org/abs/1810.03993; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0034-headless-c1-confirmatory-arm.md

## [major] Capability: when each configuration applies, its vetoes and the configuration chooser itself stored as versioned data, as the recommender's knowledge base. This lets the recommender give a reproducible answer, including 'no configuration fits' and 'refused'.
- GAP: The recommender ('which configuration fits this problem') has no machine-readable inputs:
- The 03 chooser exists only as a mermaid decision tree.
- Sit-out conditions (02 §5), vetoes and guardrails are prose. Vetoes cover evasion use cases, accuracy-critical use cases until VERIFY exists, and P8; guardrails include C5's ban on real-person likeness and C6's ban on fabricated facts.

The chooser and the inclusion rubric were written and scored by a single AI rater, and are accepted only by continuation (ADRs 14 and 16).
- FIX: Each protocol configuration entry carries:
- predicates for when it applies: is the output a decision or an artifact; does a render exist; is a human with taste available; is divergence wanted; is it a series; does it signal the sender's effort; is correctness the main pain (then answer 'not served until VERIFY');
- the human roles it requires;
- vetoes and guardrails;
- success criteria and a lite profile.

The chooser is compiled from these predicates and versioned in the registry. A recommendation then reads, for example: 'chooser v1.2 → C3 because predicates a and b'.

The recommender must be able to answer 'no fit' or 'refused (veto)'. Product documentation states that the chooser came from a single AI rater until independent experts re-score it.
- ENF: system | COST: About 2–3 engineer-days of data entry and tests.
- SRC: file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/03-configurations.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0016-anchored-rubric-for-choosing-configurations.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0018-correctness-outside-v1-verify-parked.md

## [major] Capability: a composer that works at design time, constrained by the grammar. It produces recipes only through the engine's public API, and the validator enforces what it may change.
- GAP: The draft places the composer in the product layer, 'emitting recipes', but sets no limits on what it may do. Prior art points the other way:
- ADAS and AFlow represent agents and workflows as code and search over them against validation sets.
- DSPy optimizes prompts against a metric. 05 §H warns that metric-driven prompt search 'brings averaging back', the opposite of this protocol's thesis.
- WorFBench found that even GPT-4 has a gap of about 15% between sequence planning and graph planning, so LLM-generated graphs will often be invalid.
- MaAS samples a different architecture per query but optimizes against cheap benchmark accuracy, which taste outcomes do not have.

The draft also does not record that 05 §B classifies an LLM assembling configurations as off-path.
- FIX: The composer's only path is: validate → register (kind=composed, channel=workspace) → run.

The validator's profile for kind=composed allows:
- only blocks with status=admitted;
- knob values within their registered ranges;
- filling only declared template slots (brief, axes, refs) — frozen block prompts are untouchable;
- only catalog exceptions marked composable, and never study-manipulation exceptions.

Protected checkpoints cannot be removed or bound to an AI proxy where a rule requires a human: R9 (words readers attribute to the user, i.e. VOICE) and C6/C6a authorship.

Every composed recipe fills the 03 'Building a new configuration' steps as required fields:
- artifact, audience, job and feeling;
- render;
- who holds taste and voice;
- whether divergence is wanted;
- entry point;
- sit-outs with reasons;
- stop rules, cost and a lite profile;
- success criteria judged outside the loop;
- BANK.

The composer recommends before it composes. It tries the canonical configurations first, and a composed recipe is shown as a diff from the nearest canonical one, with its cost estimate, before it runs.

The topology is never assembled at runtime.
- ENF: system | COST: About 3–5 engineer-days on the engine side for the composed-kind validator profile. The composer itself is product work, scoped in the product spec.
- SRC: https://arxiv.org/abs/2408.08435; https://arxiv.org/abs/2410.10762; https://arxiv.org/abs/2410.07869; https://arxiv.org/abs/2502.04180; https://arxiv.org/abs/2310.03714; file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/05-more-to-explore.md

## [major] Capability: a block admission pipeline that defines how the lego set grows, including blocks such as VERIFY that are non-blind and off-path.
- GAP: The draft says new blocks enter 'through the same protocol process (ADR, ⟨A⟩ marking, evidence level)'. It defines no states, no tests and no rule for adding a new port type or role.

VERIFY is off-path under ADR-0003, because the article has no correctness judge. It is also non-blind (it checks claims against sources), so typing it as a critic would break P1.

With one small team doing both research and product, the people who admit a block are the people who sell it.
- FIX: States:
1. proposed
2. experimental: Lab only, invisible to the recommender and composer
3. admitted: composable, labelled untested
4. studied: has claims-registry records

Admission requires:
- an ADR;
- a block card in the ADR-0007 anatomy, plus model-card-style intended use and evaluation scope;
- an origin label: article generalization, ⟨A⟩ protocol extension, or off-path import from 05;
- a role assignment. VERIFY would be a new 'verifier' role with its own port rule: it may read the artifact and sources, never taste refs, and never decides taste;
- compatibility and sit-out rows;
- bypass semantics;
- conformance fixtures;
- a pruning re-check whenever models change (05 shortlist #8).

Any new port type or role bumps the ruleset version through an ADR.

A block becomes studied only through a preregistered study.

An independent co-investigator signs admission of any block that will appear in a study, and the ADR records honest 'Decided by' provenance.
- ENF: process | COST: About 1 engineer-day for the checklist and CI checks, then roughly 1–3 days per new block.
- SRC: https://arxiv.org/abs/1810.03993; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0003-stay-faithful-park-off-path-findings.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0018-correctness-outside-v1-verify-parked.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0007-eight-block-codes-anatomy-and-glue.md

## [major] Capability: a firewall around research instruments, so the product's recommender, composer and defaults are never tuned against the measures research uses to judge them.
- GAP: CC3 stops product data from flowing into studies. The five rules let the product reuse 'cheap automated checks' (sameness, defect) as features. Nothing stops the reverse leak: tuning product defaults, the recommender or the composer against:
- held-out AI judge prompts or references;
- sealed confirmatory briefs;
- rater data;
- the same automated checks that later serve as secondary outcomes.

Optimizer studies show that gains measured on a fixed evaluation set often fail to transfer: GEPA's optimized agent did worse than baseline on new tasks (Wang et al. 2026). And once a measure has been optimized against, it is no longer a fair outcome measure.
- FIX: Research instruments live in the evaluation side's store, and product workspaces cannot read them; access is scoped per workspace. These cover:
- judge prompts and references;
- confirmatory and held-out briefs;
- ratings;
- held-out problem sets.

Any check the product reuses is forked under its own version ID. A later study that uses that check as an outcome must either declare that the product optimized against it or use a held-out variant.

Data used to develop the recommender or composer is logged with its provenance, so later studies can exclude contaminated tasks.
- ENF: system | COST: About 1–2 engineer-days for access scoping and the fork convention.
- SRC: https://arxiv.org/abs/2607.14004; file:///C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0032-separate-python-evaluation-side.md

## [minor] Capability: evaluating the recommender and composer later, kept light. Decision traces are logged from the first release, and evaluation follows a staged plan.
- GAP: The draft has no plan for testing whether recommendations or composed recipes are any good. Without traces logged from the first release, a later evaluation has nothing to analyse. Usage data alone cannot serve as confirmatory evidence (CC3).
- FIX: From the recommender's first release, log for each decision:
- the problem-statement hash (with consent);
- the extracted predicates;
- the candidates considered;
- the chooser version;
- the chosen configuration hash or composed recipe hash;
- the validator verdict;
- any user override;
- estimated vs. actual cost.

Evaluate in three steps:
1. Offline agreement with independent expert labels on a sealed, held-out set of problem statements written by people outside the team, including vetoed and out-of-scope cases, to measure refusal accuracy. This follows the router-benchmark pattern.
2. The validity rate of composed recipes and the error of cost estimates.
3. A separately preregistered outcome study: the recommender's pick vs. the default canonical configuration vs. a plain baseline on held-out problems. It uses the existing outside-the-loop judges and checks for regressions against the canonical configurations.

Usage logs stay exploratory.
- ENF: process | COST: About 1 engineer-day for logging at first release. The evaluation itself is a future study budget.
- SRC: https://arxiv.org/abs/2403.12031; https://arxiv.org/abs/2607.14004; https://arxiv.org/abs/2410.07869

## [minor] Capability: exporting provenance in a standard format, so lineage and labels can be checked outside the team.
- GAP: CC5 promises open data, materials and the frozen engine, but run manifests and lineage use a format the team invented. Reviewers and product customers cannot check a label's derivation chain with standard tools.
- FIX: Export run manifests and recipe lineage as a Workflow Run RO-Crate, using PROV derivation relations. Include it in the replication package, and offer it as a 'show provenance' download for product runs.
- ENF: system | COST: About 2 engineer-days, after Paper 1's data freeze.
- SRC: https://www.researchobject.org/workflow-run-crate/; https://www.w3.org/TR/prov-overview/

USER DECISIONS:
- Record a new ADR (Decided by: User) that the product may compose new configurations at design time, even though protocol 05 §B calls 'an LLM assembling the legos itself' off-path and 'a different system'. Runtime self-assembly stays parked in 05, and no paper claim covers composed recipes until a separately preregistered study.
- Accept the seven day-one engine requirements into Phase 0. That adds roughly 10–15 engineer-days to the planned ~4-week harness spine; most of it Paper 1 needs anyway. The alternative is to defer the product-only fields (kind, lineage, channel, role, status) and accept a recipe-hash schema migration later.
- Choose the recipe format: canonical JSON hashed with RFC 8785, with YAML and the UI as authoring front ends; or typed YAML as the source of truth (ADR-0029 follow-up).
- Ratify ADRs 11 and 13 and the 03 exceptions table before they become ruleset v1.0 and hard validator gates. Also decide the port rule 4 exception for C1-H's D3-auto on unpicked candidates.
- Approve the computed evidence-label rule: 'Studied' only on an exact scope match. A product C1 with live humans would show 'Derived from studied (C1-H, headless)' with the differences listed, never 'Studied'. Nulls and equivalences are shown as well.
- Decide whether the registry, ruleset, recipe schema and validator ship as open source with the paper, so reviewers can re-run validation (part of CC5's frozen engine), while the recommender and composer stay closed.
- Name who independently signs block admission and promotion of a recipe to a protocol configuration, given that research and product are the same people. Proposal: the CC4 academic co-investigator or independent statistician.
- Decide whether VERIFY may enter the lego set as a product-only, 'admitted, untested, off-path extension' before any study tests it.