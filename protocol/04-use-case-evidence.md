# 04 · Use-Case Evidence

This is the research behind the choice of configurations in [03-configurations.md](03-configurations.md).

**How the evidence was gathered and checked**
1. Seven independent research sweeps covered:
   - cross-domain knowledge work and "workslop";
   - design and AI app builders;
   - writing and marketing;
   - software engineering;
   - research, strategy and decks;
   - practitioner voices;
   - the market map.
2. A synthesis agent combined the sweeps.
3. **Two rounds of verification followed:**
   - A skeptic spot-checked about 20 load-bearing figures and found no fabrications, though several interpretations were overstated.
   - A second review checked 55 more claims against their primary sources: 37 were accurate, 17 had minor inaccuracies and 1 was wrong. All are corrected below and logged in [Corrections](#corrections).
4. Of the 310 sources in [SOURCES.md](SOURCES.md), those without a ✓ have not been re-opened. Market figures are mostly vendor or aggregator estimates.
5. A later external review of byway (2026-10-08) found the summaries' seed-string wording broader than its source. The narrowed wording is logged as Round 3 in [Corrections](#corrections).

## Scoring rubric

The rubric uses seven criteria, each scored 1–5. A single rater (the protocol author) scored them from the evidence below, so treat the numbers as structured judgment, not measurement.

| Criterion | 1 | 3 | 5 |
|---|---|---|---|
| **Pain** | mild annoyance | measurable rework or trust loss | large, quantified cost per instance |
| **Freq** | a few times a year | monthly to weekly | daily or continuous |
| **Pull**: does the producer feel it? | producer doesn't feel the cost | cost is felt, but late | producer's own audience punishes them directly |
| **Evid-pain** | anecdotes | credible industry surveys | peer-reviewed studies or large surveys |
| **Evid-fix**: do the blocks' mechanisms help *here*? | no evidence | indirect or adjacent evidence | direct evidence on this kind of artifact |
| **Thesis**: fit to the article's argument | unrelated | partial (e.g., the additive default but not sameness) | sameness, additive default and voice all central |
| **Blocks** | one block does the work | about half | nearly all |

### Ranked (researched) use cases

| Use case | Pain | Freq | Pull | Evid-pain | Evid-fix | Thesis | Blocks | **Total /35** | Configuration |
|---|---|---|---|---|---|---|---|---|---|
| Bylined and brand writing | 4 | 5 | 5 | 5 | 2 | 5 | 5 | **31** | C3 Voice Series |
| AI-built interfaces *(the article's case)* | 4 | 5 | 5 | 3 | 3 | 5 | 5 | **30** | C1 Studio |
| Ad creative and campaigns | 4 | 4 | 4 | 4 | 2 | 4 | 5 | **27** | C5 Media Relay |
| Agent-written code changes | 4 | 5 | 4 | 5 | 3 | 2 | 3 | **26** | C7 Lean Diff *(adjacent)* |
| Presentation decks | 3 | 4 | 3 | 3 | 3 | 4 | 5 | **25** | C1 Deck mode |
| Signal-bearing personal documents | 4 | 2 | 3 | 5 | 3 | 4 | 3 | **24** | C6 Sounding Board |
| Option-space exploration | 3 | 2 | 2 | 5 | 3 | 4 | 3 | **22** | C2 Divergence Engine |
| Internal documents ("workslop") | 4 | 5 | 2 | 5 | 1 | 2 | 3 | **22** | C4 Reader-Ready *(partial fit)* |
| Teaching and training content | 3 | 4 | 2 | 3 | 1 | 4 | 4 | **21** | C3 Unit mode |

### Provisional: not researched on their own, excluded from the ranking

| Use case | Pain | Freq | Pull | Evid-pain | Evid-fix | Thesis | Blocks | Total | Status |
|---|---|---|---|---|---|---|---|---|---|
| Brand imagery and illustration | 3 | 4 | 4 | 3 | 1 | 4 | 4 | 23 | C5 Still mode *(provisional)* |
| Creator and brand video | 4 | 4 | 4 | 2 | 1 | 4 | 5 | 24 | C5 Video mode *(provisional; needs an evasion screen)* |
| E-commerce listings and product photography | — | — | — | — | — | — | — | — | not researched yet (05 §I) |

### Rejected (scored, then vetoed)

| Use case | Total | Veto |
|---|---|---|
| AI deep-research and analyst reports | 23 | **The pain is accuracy.** Citation accuracy runs 40–80% (DeepTRACE). Needs VERIFY first |
| SEO and programmatic content at scale | 23 | **Evasion risk** under Google's scaled-content-abuse policy |
| Fiction as a standalone target | 24 | Not chosen by the research as a standalone target: small market, hostile to AI involvement. **Now served by C6a**, a fiction variant of C6 added on request (human author, seeded ideas, AI only as critic) |
| Cold outreach as a standalone target | 21 | The levers that matter (relevance, data, deliverability) sit outside the blocks. Templates can still use C4 |
| Scholarly papers and peer review | — | Integrity norms; the harm is hallucinated citations |
| Humanizing text to pass detectors | — | **Misuse** |
| Platform default quality | — | A distribution channel, not a use case. It lives in 05 as a [channel candidate](05-more-to-explore.md#j-channel-candidate-platform-guardrail) |

**How to read the tables**
- The rubric informed which configurations exist, but did not decide it alone. A configuration exists where (a) the total or the thesis fit is high, **or** (b) it is a standalone form of one of the article's stages (C2 = Discover on its own); **and** no veto applies. C4 is the stated exception: it is included on volume (the highest Pain × Freq) as a *partial-fit* configuration. **C6a** (fiction) was added on request as a variant of C6; its grounding is the writing-sweep evidence on fiction (Doshi & Hauser; Padmakumar & He; Chakrabarty et al.), not a separate market case.
- **Evid-fix is low almost everywhere.** No study tests these configurations end to end. That gap is the protocol's biggest open question.

---

## Use-case cards

### Bylined and brand writing → C3

**Pain**
- **Expert readers can tell, and suspicion alone costs trust.**
  - A majority vote of five heavy-LLM-user annotators misclassified only 1 of 300 articles, including paraphrased and "humanized" ones. Individual experts were less reliable (Russell et al., ACL 2025).
  - Lay readers rely on flawed cues (Jakesch et al., PNAS 2023), yet suspected AI content still cut trust by nearly 50% (Raptive, n=3,000; an ad network with a stake in human content).
- 95% of B2B marketers use AI and 87% report productivity gains, but only 39% report better performance (CMI 2026, n=1,015). Differentiation is the 5th-ranked challenge, cited by 24%; "content that prompts action" is first, at 40%.
- AI users and non-users report strong results at the same rate, about 14% (Orbit 2026). Non-users are more likely to report *disappointing* results.
- In 8,035 expert edits of LLM-written paragraphs, 18% were pure deletions (Chakrabarty, Laban & Wu, CHI 2025).
- LLMs are near random at judging writing quality (WQ).

**Counter-evidence.** 892 participants preferred GPT-4 cross-platform posts over human ones, mainly on Facebook; the advantage faded on X and Instagram (Aldous et al.). AI drafting isn't penalized in itself.

**Market.** Enterprise marketing AI spend was $660M in 2025 (Menlo). Generic copy is commoditized.

### AI-built interfaces → C1

**Pain**
- In a scan of 1,590 Show HN sites, 22% showed 4 or more of 16 AI design patterns, and 32% showed 2–3 (Krebs 2026).
- Anthropic's own skill now lists *second-order* defaults to avoid.
- 52.2% of designers name AI output quality as a blocker (UX Tools 2026).
- Only 54% of designers say AI improves quality, versus 68% of developers (Figma 2025).
- UIClip (UIST 2024): GPT-4V judged UI quality at 51.6%, close to chance.
- Design Theater (2026): about 1 in 4 user-facing design rationales from five generative-UI tools were not (fully) implemented, rising to 34% for functional requirements. *Our inference:* a critic that reads the stated rationale would inherit this gap.

**Market** *(unverified estimates)*. Lovable about $400M ARR (Feb 2026), Replit $525M annualized, v0 4M users. Design AI is about 7% of Menlo's $7.3B departmental total, roughly $500M (exact figure unconfirmed).

**Gap.** There is no conversion A/B evidence for this use case.

### Ad creative and campaigns → C5

**Pain**
- Consumers identify AI ads, and memory activation is weaker (NielsenIQ, EEG).
- 82% of ad executives think young consumers feel positive about AI ads, versus 45% who actually do (IAB, Jan 2026).
- Preference for AI-made creator content fell from 60% to 26% (Billion Dollar Boy).
- Using the LLM as a ghostwriter anchored experts (Chen et al., *Management Science* 2024).
- Disclosure lowers trust, which recovers when the people shown stay real (Grigsby et al. 2025).

**Counter-evidence**
- AI banners got *up to* 50% higher click-through than professional stock photography (Hartmann et al., *IJRM* 2025).
- LLM ads built on persuasion principles were preferred 59.1% vs. 40.9% over human ads, despite a detection penalty (Meguellati et al., preprint).

**Market.** More than 8M advertisers had used a Meta generative-AI creative tool by Q1 2026 (company-reported).

### Agent-written code changes → C7 (adjacent)

**Pain**
- 66% name "almost right" as their top frustration, and 3.1% highly trust AI accuracy (Stack Overflow 2025).
- GitClear: copy/pasted lines rose from 8.3% to 12.3% (2021–2024), and moved lines fell from 25% to under 10% (correlational).
- On high-adoption teams, PR size rose 154% and review time 91% (Faros).
- Self-correction has a 64.5% average blind spot (Self-Correction Bench).
- Feedback from a stronger model gives much larger repair gains (Olausson et al., ICLR 2024).
- Agent PRs merge 83.8% of the time, versus 91.0% for human PRs (Watanabe et al.).
- METR found experienced developers 19% slower in 2025; its redesigned 2026 follow-up suggests they are now likely faster.

### Presentation decks → C1 Deck mode

**Pain**
- AutoPresent (CVPR 2025): every model fell short of human-designed slides. Self-refinement added about 2–4 points on a 100-point score over three rounds, mostly in round 1.
- SlideAudit (UIST 2025): an expert flaw taxonomy improved LLM flaw detection.
- Microsoft's FAQ says Copilot may produce similar content for different people.

**Market.** Gamma has about $100M ARR and 70M users. The standalone category is "collapsing into a feature" (Sacra).

### Signal-bearing personal documents → C6

**Pain**
- After one-click AI proposals launched, employers stopped paying a premium for customized applications. A *structural counterfactual* predicts the top-ability fifth would be hired 19% less often and the bottom fifth 14% more (Galdin & Silbert).
- How well a cover letter matched the job stopped predicting callbacks as strongly (that correlation fell 51%), and time spent editing predicted success (Cui et al. 2025).
- Screening accuracy fell 4–9% (Cowgill et al. 2026).
- LLM essays were formulaic even with personas (Cornell, COLM 2025).
- LLM screeners preferred their own generated resumes over human-written ones 67–82% of the time (Xu, Li & Jiang, v3 2026).

### Option-space exploration → C2

**Pain**
- AI-assisted idea sets were less diverse in 37 of 45 comparisons (Meincke, Nave & Terwiesch, *Nature Human Behaviour* 2025).
- BCG (758 consultants): on a *creative product-innovation* task, GPT-4 users scored about 40% higher than controls, with 41% less diverse ideas.
- Only about 5% of LLM research ideas were non-duplicates (Si et al., ICLR 2025).
- Claude Code, run on three model versions, picked the same top tool per category across five rephrasings 76% of the time on average (Amplifying, Feb 2026; 2,430 runs).
- A human-led mode preserved diversity and ownership (Maier et al., CHI 2026).

**Counter-evidence.** GPT-4's ideas averaged higher purchase intent than elite students' ideas (Girotra et al. 2023). The pain is diversity, not quality.

### Internal documents ("workslop") → C4 (partial fit)

**Pain**
- 40% of 1,004 US desk workers received workslop in the past month, at about 1h51m and $186 per employee per month (BetterUp Labs and Stanford, 2025).
- A 2026 follow-up of about 2,300 workers found 55% of Canadian workers admit to *sending* it.
- 66% of people rely on AI output without evaluating it (KPMG and University of Melbourne).
- AI users are rated lazier and less competent (PNAS 2025, N=4,439).

**Reframe.** The sender's cost is real but *invisible or delayed* (hence Pull = 2). Adoption lever: show senders the recipient's view.

**Counter-evidence.** In transactional trust games, AI-assisted messages earned equal trust even when disclosed (Purcell et al., *iScience* 2025).

### Teaching and training content → C3 Unit mode

**Pain**
- 310 lesson plans (2,230 activities): 45% of activities were remember-level and 10% higher-order. 94% of *activities* had no multicultural content, and plans from all three chatbots followed the same general format (Trust, Maloy, Xu & Pelletier, CITE 2025).
- Teachers preferred human-made plans (d=0.44; Cooper 2024).
- LLM graders were weak on pedagogical depth (Hauk et al. 2025).

**Risk.** Artifact quality is dissociated from learning effectiveness (SLATE 2026).

### Fiction → C6a (variant added on request)

**Pain**
- Stories written from AI-supplied ideas were rated better but were more alike (Doshi & Hauser, *Science Advances* 2024).
- Homogenization came from model-contributed text, not from what people wrote themselves (Padmakumar & He, ICLR 2024).
- Expert edits of LLM prose: awkward word choice 28%, unnecessary exposition 18%, clichés 17%, with 18% pure deletions (Chakrabarty, Laban & Wu, CHI 2025).
- LLMs are near random at judging writing quality without references (WQ).

**Market.** Small and hostile to AI provenance (the Authors Guild's "Human Authored" certification). Copyright concerns rule out fine-tuning on other authors' books.

### Provisional cards
- **Brand imagery.** In 4M+ artworks, average visual novelty fell after text-to-image adoption while peak content novelty *rose* (Zhou & Lee, *PNAS Nexus* 2024). Iterative generate-and-describe loops converge to about 12 motifs (Hintze et al.; indirect).
- **Creator video.** Disclosing AI on TikTok lowers engagement by weakening the parasocial bond (Carney et al., *JCR* 2026). Evidence otherwise thin.

---

## Cross-cutting findings that shaped the protocol

1. **AI raises individual quality but shrinks collective diversity** (BCG; Doshi & Hauser). Quality loops (CRITIC) and divergence (SEED/VISION) act on different axes, so both are needed. The diversity loss is invisible to the individual.
2. **Sameness doesn't respond to temperature or model swapping** (Artificial Hivemind). In SSoT's tests, a seed string the model wrote itself beat simply asking for diversity, and generally beat external randomness injected into the prompt or fetched with a tool (DeepSeek-R1, on a probabilistic-instruction test and on NoveltyBench; [01 · SEED](01-blocks.md#seed--external-seeding)). **The article's own setup, a shell-generated string driving a design workflow, is untested.** Chain-of-thought idea prompting and verbalized sampling also raise diversity from *inside* the model, so "variety must come from outside the model" is the article's prescription, not a proven law.
3. **Bans move the mode rather than removing it.** Anthropic's skill now lists second-order defaults. Audit-after vs. ban-before has *never been tested head to head*.
4. **CRITIC design rules:**
   - Use a different, ideally stronger model in a fresh context. *Evidence-backed.* Show it only the render. *The article's prescription, supported by inference (Design Theater).*
   - Unanchored judges are unreliable. *Evidence-backed, though from older models.*
   - Ranking against references aligns better with humans but is more sensitive to distractors. *Mixed evidence.*
   - Scope findings and cap loops. *Evidence-backed.*
   - Hide the threshold. *The article's prescription; untested.*
5. **Over-production is the most universal failure** (length bias, addition bias, GitClear, workslop padding, 18% deletion-only edits). CUT is the most broadly applicable block.
6. **AI output isn't penalized in itself.** AI posts, ads and messages can win (Aldous; Meguellati; Purcell; Girotra; Hartmann). The penalties attach to *suspected* low effort or inauthenticity, to sameness, and to missing substance. **So success is measured as preference and outcomes with disclosure held constant, never as "not detected"** (port rule 8).
7. **Who drafts first matters.** AI-first ghostwriting anchors people (Chen et al.), while human-led modes preserve ownership (Maier et al.). Hence the human-first VISION step and the inverted C6.
8. **Structure vs. surface is a switch, not a rule.** Prototypical layouts win first impressions (Tuch et al.), but the article breaks structure on purpose. Hence C1's `structure` knob, default free.
9. **Accuracy is outside the eight blocks.** Research and analysis need a VERIFY block.
10. **The market gap.** Incumbents productize consistency (brand kits, design-system grounding). The protocol's distinctive blocks live in open-source skills. Ship configurations as portable layers (skills, MCP) inside existing hosts.
11. **Who feels the pain decides adoption.** Creators look for fixes. Workslop senders don't, so C4 must be nearly frictionless.
12. **Speed gains outrun quality gains in every survey** (Figma 78% vs. 32%; CMI 87% vs. 39%). The unmet need is a bar set at **best-in-category**, plus diversity across a whole portfolio.

## Evidence gaps

- No end-to-end test of any configuration. Evid-fix is low everywhere.
- No head-to-head test of up-front bans vs. post-hoc audits.
- No test of the article's own SEED setup, a shell-generated string driving a design workflow. SSoT compared external and model-written strings only on a probabilistic-instruction test and on NoveltyBench, with DeepSeek-R1 ([01 · SEED](01-blocks.md#seed--external-seeding)).
- No conversion A/B test of distinctive vs. generic AI pages.
- The hidden-threshold design is untested, and critic reliability for current frontier models is unmeasured.
- RELAY evidence is thin outside ads. VOICE's time cost and outcome lift are unmeasured.
- Market figures are mostly vendor or aggregator estimates. There's no buyer research (agencies, enterprise IT/L&D, school districts).
- No validated portfolio-level diversity metric exists.
- Cross-cultural effects: AI pulls writers toward Western norms (Agarwal et al., CHI 2025).

---

## Corrections

**Round 1: skeptic on the synthesis**

| Original | Correction |
|---|---|
| Watanabe's "45.1% of PRs needed revision" used as an AI-specific pain | No difference from human PRs. Use the merge-rate gap instead |
| Wetch's 21/28 skill win | Judged by a model from the same family; anecdotal |
| Zhou & Lee cited as UI evidence | It's an art platform. Moved to brand imagery, and the rise in peak novelty is now reported |
| Hintze: "collapse at any temperature" | An iterative generate-and-describe loop; indirect evidence |
| CMI "24% differentiation" presented as the core pain | 5th-ranked challenge |
| Gartner "50% avoid GenAI brands (2026)" | Oct 2025 survey |
| METR "19% slower" | Now carries the 2026 caveat |

**Round 2: the protocol review** (55 claims re-checked; review lenses: article fidelity, consistency, scope, practitioner)

| Original | Correction |
|---|---|
| Amplifying: "several agents and versions" (introduced by round 1) | **Claude Code only**, three models. 76% is per-category tool-pick stability, not whole-stack identity |
| BCG: "758 consultants, +40% quality" | The 40% applies to the *creative product-innovation task* only |
| Trust & Maloy: "94% of plans" / "the same template" | 94% of **activities**; plans followed "a similar general format"; authors are Trust, Maloy, Xu & Pelletier |
| Galdin & Silbert "top fifth hired 19% less" | A **structural counterfactual**, not an observed outcome |
| Xu et al. "68–88%" | **67–82%** (v3, 2026), versus human-written resumes |
| Hartmann "about 50% higher CTR" | **Up to** 50%, versus professional stock |
| AutoPresent "1–3 points" | **About 2–4 points** over 3 rounds, mostly in round 1 |
| Design Theater "critic gets misled" | Tools, counts and the 34% figure added. "Misled" is labeled our inference |
| Lovable "100k products/day; 200k by Mar 2026" | 100k **projects**/day (Nov 2025); about 200k by **May** 2026 |
| Russell et al. | **Majority vote**; individual experts were less reliable |
| Santagata & De Nobili "76–100% additive" | On structural puzzles. Llama 3.1 leaned subtractive on one task, and models **shortened** summaries |
| Antislop "hard bans collapse quality" | It's decode-time token banning that collapses quality, at about 2,000+ patterns |
| Advisor strategy "matches the article" | Directionally consistent only. The advisor sees context, and the comparison was against Sonnet alone |
| Tyen et al. | About locating errors in reasoning traces; an analogy for critique, not a direct finding |
| TinyStories "random words beat high temperature" | A design observation, not a controlled comparison |
| TechCrunch em dashes | A targeted model update later made the ban work |
| Success criteria such as "not flagged as AI" | Replaced with preference and outcome measures, disclosure held constant (port rule 8) |
| Success judged by the loop's own critic | Replaced with held-out evaluators |
| Rubric had no anchors and mixed evidence types | Anchors added; evidence split into Evid-pain and Evid-fix; workslop Pull 3 → 2; provisional rows excluded; rejected rows scored with vetoes |
| Counter-evidence missing from cards | Aldous, Meguellati, Purcell and Girotra added |

**Round 3: post-release review (2026-10-08)** (an external review of byway, checked against the source by the [review verification](../docs/reviews/2026-10-08-external-review-verification.md), finding RS; source: [String Seed of Thought v3](https://arxiv.org/html/2510.21150v3) §5.1.2 and App. D.6, as read by that verification)

| Original | Correction |
|---|---|
| Map gaps: "External seed strings untested; SSoT tested model-written strings" | Only the article's shell-seeded design workflow is untested. SSoT compares external and model-written strings on two other tasks (§5.1.2; App. D.6) |
| Map SEED evidence: "the external-RNG variant is untested" | Model-written strings generally beat injected and tool-call external strings (§5.1.2, probabilistic instruction following; App. D.6, NoveltyBench Curated, DeepSeek-R1-0528). The article's shell-seeded design workflow is untested |
| Finding 2: "The article's external shell-RNG variant is untested." | The article's own setup, a shell-generated string driving a design workflow, is untested. SSoT's model-written strings generally beat injected or tool-fetched external randomness (§5.1.2; App. D.6) |
| Evidence gaps: "No test of external seed strings." | No test of the article's own SEED setup. SSoT's comparisons with external strings used a probabilistic-instruction test (§5.1.2) and NoveltyBench (App. D.6), with DeepSeek-R1 |
| README article prescriptions: "The external shell-RNG seed. SSoT tested a seed string the model writes itself." | A shell-generated seed string driving a design workflow. SSoT's comparisons with external randomness used other tasks (§5.1.2; App. D.6) |
| 01 · SEED evidence cited only the probabilistic-instruction test | Adds App. D.6: on DeepSeek-R1-0528 and NoveltyBench Curated, model-written strings beat Seed Injection and Tool Call on distinctness and utility in every category except product recommendations; both external forms still scored above no seed on overall utility. Names each test's model and task, and that neither is design work |
