# replicator
VERDICT: The charter aims at the right things: a Registered Report, locked snapshots, a data firewall, open release and stated claims limits. As a hostile replicator, though, I would not need to prove misconduct. I would only need to show that the design cannot rule it out, and as drafted it cannot. Nearly every protection is enforced by the same people who hold the product interest:
- the lock is enforced by their own harness, which they can patch;
- "sealed" briefs are hashed files they drew, screened and read, using a seed they picked;
- only they can vouch that the archive is complete;
- they approve their own deviations (CC8);
- the independent statistician is only "ideally" there (CC4);
- the conflict of interest is handled by disclosure alone (CC6), and the evidence shows disclosure does not remove bias and can make it worse.

Three gaps are fatal under the user's 'ABSOLUTELY AND WITHOUT COMPROMISE' standard:
- **(1) Uneven tuning and undisclosed pilots.** C1-H's prompts, critic calibration and D3-auto prompts get tuned on the development briefs and in the product Playground, while baselines stay fixed strings. Unblinded pilot ratings can also steer choices.
- **(2) No independent party controls unblinding, exclusions, deviations or publication.**
- **(3) The archive cannot be checked from outside.** Nothing stops a re-run of the confirmatory batch with only the better outcome kept.

Several major gaps follow:
- model drift that hits C1-H's long, multi-image calls harder than the one-shot baselines;
- retired models, plus 'container digests' that are pointers, not the images themselves, so re-execution becomes impossible;
- contamination from LLM taste shared across model families, and from raters using AI tools;
- harness and rendering effects that differ by arm;
- weak baselines;
- an OSF fallback the authors can choose after the pilot;
- spin in the paper and in product claims.

Most fixes are cheap system mechanisms (a tuning ledger, a hash-chained gateway log reconciled with provider usage records, fidelity assertions, render logs, evidence labels computed from a results registry), plus three outside parties:
- an independent methods lead, who holds the arm-label key and has freedom to publish;
- the PCI RR recommender, who approves deviations;
- a public randomness beacon for the brief draw.

Rough added cost is $5–12k and 2–4 weeks on top of the ~$24k core. The charter's main structural change: every CC item must name who or what enforces it, and no item may rely on the authors' word alone.

Release package a replicator needs, released when confirmatory data collection ends rather than at publication:
- the full brief sampling frame, the beacon pulse and draw script, the exclusion log and fictionalization edits;
- the copywriter's instructions and decks;
- every prompt version ever run on any arm, with its development outputs (the tuning ledger);
- critic calibration items and result;
- the engine and recipes at the locked commit under a license that lets competitors re-run them;
- container image tarballs, the npm mirror snapshot and the fonts cache (not just digests);
- the renderer and the Judge app;
- every request and response, seeds.jsonl, every snapshot, and renders with their render logs;
- the hash-chained gateway log and the provider usage reconciliation;
- rater trial-level data (re-keyed), including side, timing, focus-loss and gold-check fields, plus a data dictionary;
- the exclusion log, Inspect logs, and analysis code timestamped before unblinding;
- pilot data in full, and the deviations log approved by the recommender.

Background files used: section1_draft.md; ADRs 0008, 0015, 0017, 0024, 0027, 0031–0038 and 0041 in C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/; study1-draft.md, methods.md, architecture.md and tooling.md in C:/Users/arvik/OneDrive/Documents/ActAI/docs/research/2026-10-06-harness-research/; 03-configurations.md.

## [fatal] Uneven tuning and undisclosed pilots. C1-H's seed prompt, critic prompt, critic calibration set (the 2–3 strong and 2–3 generic sites are chosen by the authors), D3-auto prompts and cap/plateau rules get iterated on the 12 development briefs, and in the product Playground, by people who want C1 to win. Meanwhile B-Plain and B-Random are fixed strings and B-Skill is pinned at a commit the authors pick. Any C1-H win is then partly a tuning-budget artifact. Meaning-preserving prompt-format changes alone can swing results by up to 76 accuracy points (Sclar et al.), and whole fields' claimed gains have shrunk to marginal once baselines got equal treatment (Musgrave et al.). The product Playground is also an unregistered pilot of unlimited size: every product iteration on the C1 recipe before the lock is a forking path the reader never sees. This is the Leaderboard Illusion pattern, where one vendor privately tested 27 variants and selective disclosure biased the scores. Finally, the ~1,500-judgment rater pilot, if the team sees it by arm, can steer question wording, exclusion rules and the choice of compute control (CRITIC-self vs best-of-N) toward whatever favours C1.
- GAP: CC2 locks the end state but records nothing about the path to it: how many tuning iterations, how many dollars, and which briefs each arm received. CC3 keeps product data out of confirmatory analysis, but not product-side experimentation on the C1 recipe out of what gets locked. No CC item covers how the pilot is handled, even though PCI RR requires preliminary studies to be published at Stage 2 and clearly distinguished from the preregistered protocol (policy 3.7). Nothing makes the authors declare their PCI RR bias-control level against Playground exposure.
- FIX: (1) Tuning ledger. The gateway tags every call by workspace and recipe or prompt hash. Every prompt, recipe or critic-calibration version that touched any arm before the lock is exported with its brief and outputs, plus a per-arm count of iterations and dollars spent. It is published in the Stage 1 supplement. (2) Symmetric pilot policy, preregistered before the pilot starts. Prompts freeze before the pilot. In the pilot, changes are allowed only for a closed list of failure classes (crash, copy-deck non-compliance, tool misuse, render failure). Each change is applied to every arm it is meaningful for, and the total number of changes is capped. (3) Any C1 recipe run in the Playground or product before in-principle acceptance (IPA) happens only in logged workspaces, and the counts and versions are declared in Stage 1. (4) The independent methods lead (see the next attack) produces the pilot output as variance components, costs, failure rates and gold-check pass rates only, with arm labels hidden from the team. Alternatively, the arm-level pilot results go into Stage 1 in full, so reviewers know what the authors knew. (5) Put critic calibration items and their results in the ledger.
- ENF: system | COST: About 2–4 developer days to add workspace and recipe-hash tagging and a ledger export to the gateway, which already logs every call (ADR-0030). No extra model spend. The real cost is discipline: no informal C1 runs outside logged workspaces before IPA, which slows product exploration somewhat.
- SRC: https://rr.peercommunityin.org/about/full_policies; https://arxiv.org/abs/2310.11324; https://arxiv.org/abs/2003.08505; https://arxiv.org/abs/2504.20879

## [fatal] No independent control over analysis, unblinding, exclusions, deviations or publication. The people with the product interest decide every judgement call that can tilt the result: rater exclusions; which failures count as infrastructure (and so get retried); how render failures are classified; when to treat a failure as intention-to-treat versus run a sensitivity analysis; the order for simplifying the GLMM; and when to unblind. 'Blind analysis on scrambled labels' is theatre if the person who scrambles also holds the key. Disclosure (CC6) does not neutralize this. Cain, Loewenstein and Moore show disclosure can have perverse effects, and the Cochrane review finds sponsor-funded studies report more favourable results (RR 1.27) and conclusions (RR 1.34) through biases that standard risk-of-bias tools do not catch. My headline as a replicator: 'equity holders held the unblinding key and approved their own deviations.'
- GAP: CC4 makes the independent statistician 'ideally', which in practice means optional. CC6 treats disclosure as the remedy. CC8 makes deviations a dated public note that the authors approve themselves. Nothing gives anyone outside the team custody of the key, data access rights or freedom to publish.
- FIX: Make an independent methods lead mandatory: an academic co-investigator (who is also needed for the IRB) or a paid statistician, with no equity and no product role. This person:
- holds the arm-label key;
- runs the frozen confirmatory script themselves;
- applies the preregistered exclusion and render-failure rules in code before unblinding;
- signs the ICMJE statement 'I had full access to all of the data in this study and I take complete responsibility for the integrity of the data and the accuracy of the data analysis';
- has a written freedom-to-publish clause.

Every post-lock deviation goes to the PCI RR recommender before data collection is complete, as policy 3.10 requires, and is co-signed by the methods lead. Members of the product team get no access to rater data until unblinding. Report CONSORT 2025 items 5a (role of funders in design, conduct, analysis and reporting) and 20a (who was blinded, including data analysts).
- ENF: external_party | COST: About $3–8k for a statistician (30–60 hours), or co-authorship for an academic co-investigator who also supplies the IRB (and qualifies for Prolific's lower academic fee). Adds 1–2 weeks of hand-off time at unblinding.
- SRC: https://www.icmje.org/recommendations/browse/roles-and-responsibilities/author-responsibilities--conflicts-of-interest.html; https://www.cochrane.org/MR000033/METHOD_industry-sponsorship-and-research-outcome; https://ideas.repec.org/a/ucp/jlstud/v34y2005p1-25.html; https://rr.peercommunityin.org/about/full_policies; https://doi.org/10.1136/bmj-2024-081123; https://doi.org/10.1038/526187a

## [fatal] The archive's completeness cannot be checked from outside, so hidden re-runs cannot be ruled out. ADR-0027 states that reproducibility comes from the archive, not from re-running. But the archive and the gateway log are written by the authors' own software on the authors' own machine. Nothing stops them from running the confirmatory batch twice, or re-running the briefs where C1-H broke, and archiving the better outcome. 'The harness refuses any condition not in the lock' is a promise about code the authors can patch. My challenge as a replicator: prove the 1,728 pages came from a single run.
- GAP: CC2 is enforced only by the authors' own software. No outside record ties the lock to a point in time, and nothing reconciles the archive with the providers' own usage records.
- FIX: (1) Create a dedicated API key per provider at lock time, used only by the confirmatory run. Anthropic's Usage API can group usage by API key, but the Admin API is unavailable for individual accounts, so set up an organisation first. (2) The gateway writes an append-only, hash-chained log. Publish its root hash daily during the run through OpenTimestamps, with a copy on OSF. (3) Timestamp the lock manifest (engine commit, recipe and prompt hashes, container digests) before the brief draw. (4) After the run, the independent methods lead reconciles provider token counts per key and per day against the gateway log (Anthropic's documentation lists cost reconciliation as a use of this API) and publishes the reconciliation. Any unarchived calls on the study key are a reportable deviation. This meets TOP 2025's 'Certified' level, where a party independent of the researchers certifies the deposit and its timing.
- ENF: external_party | COST: About 2–3 developer days for the hash chain and timestamping. OpenTimestamps is free. The reconciliation is about 4 hours of the methods lead's time.
- SRC: https://platform.claude.com/docs/en/build-with-claude/usage-cost-api; https://opentimestamps.org/; https://www.cos.io/initiatives/top-guidelines

## [major] Brief selection and the authors' knowledge of the briefs. A 'published random seed' that the authors choose proves nothing: they can try seeds, strata definitions, frame dates, 'unsuitable launch' exclusions and fictionalization edits until the draw suits C1. Hashing the 48 confirmatory briefs only proves the file did not change after hashing, not that the authors never read or shaped it. The authors fictionalize the briefs themselves (ADR-0035). The real launches from January–June 2026 on Product Hunt and Show HN may also be recognizable to the worker model despite fictionalization, and the sampling frame is tilted toward tech products.
- GAP: CC4 makes the copywriter independent but says nothing about who draws, screens and fictionalizes the briefs. Neither CC1 nor CC2 fixes the order 'freeze prompts, then draw briefs', so prompts can be tuned with the confirmatory briefs in mind.
- FIX: Enforce this order in the study timeline:
- (a) Preregister the frame definition, eligibility rules, strata and draw script.
- (b) Freeze the prompts and timestamp their hashes.
- (c) Seed the draw with a NIST Randomness Beacon pulse at a pre-announced future time. The beacon is designed for publicly verifiable random sampling.
- (d) The independent copywriter screens eligibility and fictionalizes under written rules, and logs every exclusion and edit.
- (e) The copywriter or the methods lead holds the decks in escrow, and the harness receives them only for the confirmatory run.
- (f) Publish the full frame list, the beacon pulse, the script, the exclusion and edit log, and the mapping from real launch to fictional brief, so anyone can re-draw.

Add a recognition probe: ask the worker model to name the real product behind a sample of briefs, and report the hit rate.
- ENF: external_party | COST: About 1 day of scripting. Copywriter time rises about 10–20% for screening. Calendar delay of 0–2 weeks between the freeze and the decks.
- SRC: https://csrc.nist.gov/projects/interoperable-randomness-beacons; https://opentimestamps.org/; https://rr.peercommunityin.org/about/full_policies

## [major] Model drift that hits the arms unevenly. The same model ID does not guarantee the same behaviour. Anthropic's postmortem documents three 2025 infrastructure bugs that degraded output with unchanged weights; one context-window routing error hit up to 16% of Sonnet 4 requests in the worst hour. Chen et al. found GPT-4's accuracy on a prime-number task fell from 84% to 51% between March and June 2023. C1-H's calls are long-context, multi-image and multi-turn, while the baselines are short one-shot builds. A long-context incident would therefore hurt C1-H far more. Interleaving makes drift orthogonal to time, but not to request type. A later replicator who gets a different result can call the original window anomalous, and the authors cannot rebut it.
- GAP: CC2 pins model IDs but sets no monitoring, no pause rule, and no record of provider incidents during the run.
- FIX: (1) Run a daily canary suite during the confirmatory window. It includes a long-context, multi-image critic call identical to C1-H's, and a short build call like the baselines'. Each has a preregistered drift threshold and a rule to pause or extend the run. (2) Log request IDs, the model string returned, response headers and latency. (3) Record provider status-page incidents for the window. (4) Preregister a sensitivity analysis that drops runs inside incident windows and adds run date as a covariate. (5) Keep generation within 10 days. Run all AI judges in one short batch.
- ENF: system | COST: About $50–150 of canary calls, plus 1–2 developer days.
- SRC: https://www.anthropic.com/engineering/a-postmortem-of-three-recent-issues; https://arxiv.org/abs/2307.09009

## [major] Retired models block re-execution, and the planned release is too late, too thin or too restrictive. The tooling digest lists claude-fable-5-1 as available 'not before 2027-09-01' and claude-opus-5-5 'not before 2027-09-22'. The first round of Stage 1 review takes about 4–8 weeks, then come revisions, generation, rating and Stage 2. The paper could easily appear after those dates, leaving no outsider able to re-run C1-H on the same models. Anthropic commits to preserving weights, not API access. Container digests, a pinned npm mirror and a Google Fonts cache are pointers: if images or packages vanish, re-rendering fails. 'Product-only code may stay closed' leaves the line undefined: is the gateway product code? Are the recipes? A license that forbids competitive use would bar me, the competitor, from re-running at all, and I would call that obstruction.
- GAP: CC5 promises a 'frozen engine version' but fixes no timing, no form (artifacts rather than digests) and no license, and it leaves the boundary between research and product code undefined.
- FIX: (1) Release the replication kit when confirmatory data collection ends, not at publication. That gives outsiders at least six months of live-model access, which is what ADR-0038's six-month retirement rule actually buys. The kit contains:
- the engine at the locked commit, recipes, prompts and development briefs;
- the renderer, the Judge app and the analysis code;
- container image tarballs, the npm mirror snapshot and the fonts cache.
(2) License the kit under an OSI license, or at minimum one that explicitly permits replication and re-analysis by anyone, competitors included.
(3) Deposit the confirmatory archive with DOIs: Parquet tables plus a data dictionary (CONSORT 2025 item 4). It holds every request and response, seeds.jsonl, every snapshot, renders and render logs, rater trial-level data (re-keyed), the exclusion log and Inspect logs.
(4) Preregister a conceptual replication on successor models as a planned follow-up.
(5) Define in writing which modules count as research code (everything a locked study executes) and which as product code.

PCI RR's TOP policy requires public data, materials and code at Stage 2 as a backstop.
- ENF: process | COST: About 2–3 days of packaging. Zenodo or OSF storage is roughly free at this scale. The real cost is strategic: competitors get the engine early. That is a user decision.
- SRC: https://www.anthropic.com/news/deprecation-commitments; https://rr.peercommunityin.org/about/full_policies; https://doi.org/10.1136/bmj-2024-081123; https://www.cos.io/initiatives/top-guidelines

## [major] Judge contamination, in four forms.
(a) LLM taste carries across model families. C1-H is optimized against a Claude critic. LLM judges favour models similar to themselves, and model errors grow more correlated as capability rises (Goel et al.). Self-preference tracks self-recognition (Panickssery et al.). So agreement from the GPT and Gemini judges is not independent corroboration.
(b) Human raters using AI. Prolific's LLM authenticity checks apply only to free-text answers, and a forced choice between two screenshots is easy to paste into a vision model. 33–46% of MTurk workers used LLMs on a summarization task (Veselovsky et al.).
(c) Recognizable style breaks blinding. Raters or experts who read the article can recognize C1's seeded look. The team recruits the experts and can skew the panel toward people who like novelty.
(d) The same pilot human labels both validate the AI judges and set their thresholds.
- GAP: CC9 makes humans primary and puts AI judges in other families, but sets no control on raters' AI use, no blinding check, no third-party expert recruitment, and nothing stopping AI-judge agreement from being cited as corroboration.
- FIX: (1) Preregister that AI judges are reported only as measurement validity (RQ4), never as corroboration in the abstract or headline. Run a Claude judge separately, as a self-preference probe only. (2) The Judge app logs visibility, focus and paste events per trial. Instruct raters explicitly not to use AI, and preregister exclusion for focus loss above a threshold. (3) Add an end-of-session blinding check: have you read the article, and can you tell how each page was made? Report it and run a sensitivity analysis excluding raters who recognize the source. (4) Recruit experts through a third-party panel against preregistered screening criteria, with the team blind to their identities until rating ends. (5) Keep separate human sets for calibrating and validating AI judges, sealed before use (ADR-0036). (6) Run a Goodhart check: does human preference track the in-loop critic's score?
- ENF: system | COST: 1–2 developer days in the Judge app. Third-party recruitment adds roughly $50–150 per expert in panel fees, about $1–3k for 20. The analyses are trivial.
- SRC: https://arxiv.org/abs/2404.13076; https://arxiv.org/abs/2502.04313; https://arxiv.org/abs/2306.07899; https://researcher-help.prolific.com/en/articles/445144-what-are-authenticity-checks

## [major] Strawman baselines and compute control. As the competitor I would argue that C1-H faced only:
- a one-line prompt;
- a paraphrase of the article's 'random' prompt (the exact wording is still unconfirmed);
- Anthropic's frontend-design skill, pinned at a commit the authors chose.
Meanwhile C1-H received iterative tuning. CRITIC-self reuses the blind-critic prompt inside the worker's own context, which weakens it as a self-refine baseline. There is no compute-matched best-of-N with the same selector. The strongest open-source anti-slop skill (which 03-configurations itself cites) and commercial builders are absent. The result cannot claim 'beats the state of practice'.
- GAP: No CC item addresses how strong the baselines are, how they are selected, or whether outsiders can supply them.
- FIX: (1) Preregister a rule for choosing baselines, for example the latest release of each skill at lock date, and obtain the article's exact prompts verbatim. (2) Add r_methods' compute-matched best-of-N, selected by the same critic, or justify CRITIC-self against a published Self-Refine implementation. (3) Create an adversarial-baseline slot: before the lock, invite one or two outside owners, such as the maintainer of a popular open-source anti-slop skill, to submit their best configuration. Run it under identical conditions and report it whatever the result. (4) Limit the paper's claims to the baselines actually tested.
- ENF: external_party | COST: Best-of-N adds about $25–35 per brief, roughly $1.5k over 48 briefs, plus one more contrast in the multiplicity plan. An invited baseline costs about $7–10 per brief in generation plus coordination time.
- SRC: https://arxiv.org/abs/2003.08505; https://arxiv.org/abs/2310.11324

## [major] Harness bugs that favour one arm. The bespoke TypeScript engine has many places where a silent bug could create or erase a contrast:
- the branched prefix-sharing tree;
- the best-snapshot re-rank;
- 'snapshot = -D3';
- a replay cache keyed by request hash;
- the interleaving scheduler;
- critic isolation, where the threshold must stay hidden and the critic must see only renders.
For example, the -D3 snapshot could be taken after D3, the critic could see code or the 9/10 threshold, the cache could serve a response across arms, or the ASSET instruction could leak into the baselines' tool prompts. None of this gets tested by anyone outside the team.
- GAP: CC2 locks versions but never checks that the locked code behaves as specified. There is no independent code review and no computational-reproducibility check.
- FIX: (1) Preregister fidelity assertions with pass thresholds, checked automatically at the gateway:
- critic inputs contain no code and no threshold tokens;
- the DOM diff between -D3 and C1-H is non-zero for at least a stated share of candidates;
- no cache hits occur across arms outside shared lineages;
- baseline prompts contain no ASSET instruction.
(2) Run an A/A contrast in the pilot: one arm under two labels, through generation, rendering, the Judge app and analysis. It must come out at 50% within its confidence interval. (3) Release arm-symmetry tests with the code. (4) Before the lock, hire a red team in Lakens' model, about five people paid $200 each plus $100 per critical error. It reviews the arm-specific code paths and the Stage 1 manuscript and includes at least one person from a competing approach. (5) Submit the analysis for a CODECHECK certificate after Stage 2.
- ENF: system | COST: 3–5 developer days for the assertions and the A/A plumbing. The A/A arm adds about $100 of generation and $150 of raters to the pilot. The red team costs about $1–2k. CODECHECK is volunteer-run and free.
- SRC: https://www.cursor.tue.nl/en/news/2020/juni/week-4/successful-test-with-red-team-for-criticism-on-research-plan; https://codecheck.org.uk/; https://www.cos.io/initiatives/top-guidelines

## [major] Rendering differences. Screenshots are captured 2 s after network idle, with CSS animations disabled, WebGL captured at 2 s, full-page height capped and Google Fonts cached, and raters see desktop renders only. The arms differ systematically in page weight (ASSET images, shaders, more fonts). So failed captures, frames frozen mid-animation, blank canvases, truncation and font fallbacks will be more common in some arms than others. A hostile reader can argue either direction, and the authors classify render failures themselves.
- GAP: CC2 pins the renderer, but there is no render quality check, no per-arm failure reporting, and no preregistered rules for classifying render failures.
- FIX: (1) Release a render log for every stimulus: console errors, failed requests, font fallbacks, page height and truncation flag, and a blank-canvas detector. (2) Preregister a render-failure taxonomy and how each type is handled (intention-to-treat by default). (3) An independent person compares a random 10% of renders against the live page in the pinned browser, blind to arm. (4) Report failure and truncation rates per arm, and run a sensitivity analysis excluding stimuli flagged for render problems. (5) Keep the exploratory live-iframe expert subsample already planned.
- ENF: system | COST: 1–2 developer days for the render logs. The blind audit is about 10 hours, $300–500.
- SRC: 

## [major] Selective reporting, outcome switching and an escape hatch for the publication route. The study has two co-primary outcomes against three baselines, five ablations, equivalence and non-inferiority tests, and about ten secondary outcomes: expert ratings, Vendi score, cross-brief homogeneity, distance from the B-Plain centroid, tells, the 5-second test, defects, cost, the Bradley–Terry ranking figure, the pick(C) analysis and the optional GPT arm. If quality fails, the paper can headline distinctiveness. If lay raters fail, it can headline experts. The ranking figure can become the visual headline. In COMPare, 87% of trials in five top journals had outcome-reporting discrepancies needing a correction letter, with a mean of 5.4 undeclared outcomes added per trial. CC1 lets the authors switch from PCI RR to OSF if the timeline 'breaks the model-retirement window', a condition they control and can invoke after seeing the pilot.
- GAP: CC1's OSF fallback is at the authors' discretion. CC5's 'publish all results including nulls' sets no fixed reporting format and no outside verifier of results transparency.
- FIX: (1) Commit to PCI RR now and use its scheduled review track, which sends reviews within a fixed one-week window at least six weeks after the one-page snapshot is triaged, to save time. (2) Replace the discretionary fallback with an objective date trigger, preregistered before any pilot data exist. (3) Preregister an abstract and results-table template listing every confirmatory hypothesis in a fixed order, each marked supported, equivalent to null, inconclusive or opposite. (4) Correct secondary outcomes with Benjamini–Hochberg and label them as secondary. (5) The methods lead, together with the PCI RR recommender, checks results transparency (the TOP 2025 verification practice). (6) Under PCI RR rules, withdrawing after IPA publishes the Stage 1 protocol and the reason for withdrawal, so a buried result becomes visible. Registered Reports report 44% positive results against 96% in the standard literature (Scheel et al.).
- ENF: external_party | COST: No fees. Costs calendar time: Stage 1 review takes roughly 1–3 months, which squeezes the model-retirement window. One day to draft the template.
- SRC: https://researchonline.lshtm.ac.uk/4653668; https://forrt.org/curated_resources/an-excess-of-positive-results-comparing/; https://rr.peercommunityin.org/about/full_policies; https://www.cos.io/initiatives/top-guidelines

## [major] Spin in the paper and product claims that outrun the evidence. Likely overreaches:
- calling the study a 'replication', when the article reports no quantitative result and C1-H removes every human step;
- saying 'C1 works', when what was tested is C1-H on landing pages, with a Claude worker, judged from static renders by English-speaking lay raters;
- labelling recipes 'Studied' in the product when some of their blocks came out null;
- product marketing that cites the study before Stage 2.
In Boutron et al., 58.3% of trial abstracts with non-significant primary outcomes had spin in their conclusions. Industry-sponsored studies show less agreement between results and conclusions (Cochrane RR 0.83).
- GAP: CC7 states a policy but names no enforcer. Its 'Studied' evidence label carries no direction (supported, null or harmful) and no scope, and nothing stops product claims before the results are in.
- FIX: (1) The engine computes evidence labels from a public results registry keyed by recipe version and hypothesis ID. Each label carries a direction (Studied–supported, –equivalent to null, –inconclusive, –harmful) and a scope (domain, model, judge population, static renders). The product UI and documentation pull labels from the registry and never type them by hand. (2) No efficacy claims for any recipe before Stage 2 is accepted. Until then everything is labelled 'Research-grounded but untested'. (3) Keep a public claims ledger: every public product claim that cites the paper maps to a hypothesis ID and is signed off by the independent methods lead. (4) In the paper, call it 'a first controlled test of a headless variant (C1-H)', never a replication of C1 without qualification. (5) The red team reads the Stage 2 draft specifically for spin.
- ENF: system | COST: 1–2 developer days for the registry and computed labels. A few hours of the methods lead's time per claim. The real cost is delayed marketing.
- SRC: https://doi.org/10.1001/jama.2010.651; https://www.cochrane.org/MR000033/METHOD_industry-sponsorship-and-research-outcome

## [minor] Residual copy confounds. Every arm gets the same deck, but:
- OPTIONAL strings can be dropped, and D3's CUT step drops them by design;
- labels of four words or fewer can be added;
- generated images can carry text;
- a copywriter who has seen C1 outputs or knows the hypothesis may write decks that suit expressive layouts, such as short punchy headlines that pair well with bold type.
As the hostile replicator I would claim 'C1-H wins because its pages show less text'.
- GAP: CC4 names an independent copywriter but says nothing about their blindness, about deck timing, or about copy metrics per arm.
- FIX: (1) Keep the copywriter blind to the hypotheses, and never show them generated pages. (2) Write and hash the decks before any generation on those briefs, using a fixed template, and publish the copywriter's instructions. (3) Release for every page: retained word count, dropped OPTIONAL strings, added labels and OCR'd text inside images. (4) Preregister a covariate sensitivity analysis on retained word count for the replication contrasts.
- ENF: process | COST: About 1 day. No extra spend.
- SRC: 

## [minor] Provenance that can be edited, and AI authorship that is not disclosed. CC6 offers the ADR log as public provenance, but it is a set of editable files. Fifteen of its accepted decisions were taken only 'by continuation' and await ratification. That includes ADR-0027 (the publishability invariants) and ADR-0008 (the critic). Much of the design of a study that tests a Claude-based pipeline was drafted by Claude. A hostile reviewer will ask who is accountable for unratified choices, and whether the log was rewritten after the results.
- GAP: CC6 relies on a log that is not tamper-evident and does not require disclosure of AI assistance in design and writing.
- FIX: (1) Ratify the ADRs accepted by continuation before Stage 1. (2) Keep the log in a public repository with signed commits. (3) Anchor snapshots with OpenTimestamps or Zenodo at each milestone: lock, draw, IPA and unblinding. (4) Disclose AI assistance in the study design and the writing, following venue policy.
- ENF: disclosure | COST: A few hours.
- SRC: https://opentimestamps.org/

USER DECISIONS:
- Publication route: commit to PCI RR now, with scheduled review, and replace CC1's discretionary OSF fallback with an objective date trigger set before any pilot data exist. Accept that Stage 1 review squeezes the model-retirement window: claude-fable-5-1 is listed as 'not before 2027-09-01'.
- Who will be the independent methods lead (an academic co-investigator who also supplies the IRB, or a paid statistician at about $3–8k)? Will you grant them the arm-label key, the right to run the confirmatory analysis, co-signature on deviations and a written freedom-to-publish clause?
- License and timing for the replication kit (engine at the locked commit, recipes, renderer, Judge app, container images). Option A: OSI-open, released when data collection ends. Option B: a replication-only license. Option C: release at publication. Options B and C weaken credibility against a competitor. Also define in writing where research code ends and product code begins.
- Product guardrails: no efficacy claims or marketing for any recipe before Stage 2 is accepted; all Playground or product runs of C1 recipes before IPA happen only in logged workspaces and are declared in Stage 1; and nobody with equity sees pilot results by arm (only variance components, or the full results published in Stage 1).
- Brief draw: seed it with a public randomness beacon after the prompt freeze, and have the copywriter fictionalize the briefs and hold the decks in escrow. This costs 0–2 weeks of calendar time.
- Baselines: add the compute-matched best-of-N arm (about $1.5k)? Invite one or two outside baseline owners into an adversarial-baseline slot? Supply the article's exact 'random', seed and image prompts so the baselines are verbatim.
- Budget for credibility add-ons on top of the ~$24k core, roughly $5–12k in total: methods lead, red team (~$1–2k), third-party expert recruitment (~$1–3k), A/A pilot arm (~$250), canary calls (~$150) and render audit (~$500).
- Set up an Anthropic organisation account, since the Admin API is unavailable for individual accounts. This enables reconciliation against usage per API key. Create dedicated, spend-capped study keys for each provider.
- Ratify the 15 ADRs accepted by continuation before Stage 1, starting with 8, 15, 17 and 27, which the study freezes or relies on.
- Paper framing: agree that Paper 1 is described as a controlled test of the headless C1-H, never as a replication of 'C1', and that the AI judges never appear as corroboration in the abstract.