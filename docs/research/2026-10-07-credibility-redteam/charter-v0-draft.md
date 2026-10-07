# Design section 1 (draft for red-team): two tracks on one engine

## User inputs (verbatim, 2026-10-07)
- Product audience/form: "You are correct but some of the use cases are clear from your research and some of them will build on top of them - but yes we aren't fully decided yet. In an ideal world any user would have a problem and our product will recommend a configuration (or build one based on the user's need - especially true when we have more pieces in our "lego set") and solve for the user's needs."
- Team stays small: "yes".
- Research must stay credible even though the same people build a product on it: "ABSOLUTELY AND WITHOUT COMPROMISE."

## Structure presented earlier (2026-10-06)
Three layers, one codebase:
- Engine (shared): recipes (each configuration C1–C7, C6a as a versioned file with step toggles); durable runner (Temporal) with "Your turn" human checkpoints; model gateway (sole egress, logs, spend caps, keys out of sandboxes); hardened Docker sandboxes + pinned screenshot renderer; content-addressed archive with per-run manifests; workspaces on every record from day one.
- Research (track a): Lab study features (study sheet, locked plans, randomized interleaved scheduling, cost/power estimator, results, paper kit); Judge (hosted rater app, Prolific/expert links); Python evaluation side (Inspect AI judges, metrics, statistics) that reads only frozen, blinded stimulus bundles.
- Product (track b): its own app on the same engine; own brainstorm/spec later.
Five rules: (1) a study locks exact engine + recipe versions by fingerprint; (2) results flow one way, research → product, via new recipe versions; (3) product usage data never enters a confirmatory study (only future, separately consented, separately preregistered studies); (4) evaluation side never imports product code, product never depends on evaluation side (may reuse cheap automated checks as features); (5) conflict of interest disclosed in the paper.
Order: engine first (with C1 recipe + baselines), then tracks split.

## Draft credibility charter v0 (Claude's draft — to be attacked)
- CC1 Pre-commitment: Registered Report via PCI RR by default (in-principle acceptance before confirmatory data); OSF preregistration only if the RR timeline breaks the model-retirement window.
- CC2 Locked study snapshots: engine release, recipe versions, prompts, model IDs, judge prompts, analysis code — hashed; the harness refuses any condition not in the lock.
- CC3 Data firewall: research and product data in separate stores; product data never enters confirmatory studies.
- CC4 Independence where the small team can't provide it: independent copywriter for copy decks; expert raters recruited outside the team's network; academic co-investigator's IRB; analysis run blind on scrambled labels after code is frozen on simulated data; ideally an independent statistician signs off.
- CC5 Publish everything: all results including nulls; open data, materials, the frozen engine version, recipes, prompts, analysis code (DOIs). Product-only code may stay closed.
- CC6 Disclosure: COI statement (authors build a product on this protocol); the ADR log as public provenance.
- CC7 Claims policy: product claims only what published evidence supports, scoped to the studied version and domain; every recipe carries an evidence label (Studied / Research-grounded but untested / Composed-experimental).
- CC8 Deviations: any change after lock is a dated public deviation.
- CC9 Judges independent of the loop: loop critic never judges success; AI judges from other model families; humans primary.

## Product-vision implications Claude intends to add (draft)
- Engine gains a block registry (typed blocks with port contracts, versioned) and a recipe validator (grammar rules: port rules, compatibility table, default rules and declared exceptions) so recipes can be composed programmatically and checked.
- Recommender ("which configuration fits this problem") and composer ("build one from blocks") live in the product layer and emit recipes the engine runs.
- New blocks (e.g. the parked VERIFY block) enter the lego set through the same protocol process (ADR, ⟨A⟩ marking, evidence level).
