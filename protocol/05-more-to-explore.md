# 05 · More to Explore

These are things the research turned up that are **substantially different from the article's techniques**. They aren't generalizations of a block, so they stay out of the protocol for now, as you asked. Each entry says what it is and why it's off-path. The shortlist at the top marks the ones most likely to earn a place as a future block or block variant.

---

## Shortlist: strongest candidates for a future block

| # | Candidate | Would become | Why it's promising | Why it's not in v1 |
|---|---|---|---|---|
| 1 | **Tool-grounded verification** (CRITIC paper, Gou et al. 2023; deterministic "stop hooks") | A `VERIFY` block next to `CRITIC` | CRITIC judges *taste only*. Code, research and data configurations also need a *correctness* judge: tests, execution, retrieval checks, citation checks | The article has no correctness judge; its critic is screenshot-only |
| 2 | **Verbalized Sampling** (Zhang et al. 2025) | A second D1 diversity block, an alternative to `SEED` | 1.6–2.1× creative diversity from prompting alone. It works without tools and without a human | It reshapes the model's *own* output distribution; SEED makes the model interpret a random string (external or model-written) |
| 3 | **Pairwise tournament selection** (PairS, Liu et al. 2024) | An implementation of `pick(C,k)` | Ranks many candidates efficiently and aligns better with human judgment than direct scoring | It is selection, not the article's refinement loop |
| 4 | **Judge hardening:** a panel of judges from different families (PoLL, Verga et al. 2024), length-controlled scoring. *(Position shuffling is already in v1 as a CRITIC knob ⟨A⟩.)* | Optional `CRITIC` knobs | Reduces verbosity and self-preference bias. PoLL reports roughly 7× lower cost than one large judge | The article uses one big critic. A panel contradicts its model-tiering idea, so test it rather than adopt it |
| 5 | **Scored few-shot critic calibration** (Anthropic harness, 2026) | A "taste profile" input to `CRITIC` | Aligns the critic to *your* taste rather than a generic studio bar, and reduces drift | The article's references are an unscored moodboard. Scored exemplars turn the critic into a grader trained on your taste |
| 6 | **Up-front aesthetic skills / avoid-lists** (Anthropic frontend-design skill), and the gentler **soft-steer** variant: positive direction for 1–3 chronic tells in the brief | An A/B test against `TELLS`' audit-after approach | Cheap; already in use in Claude Code | It directly contradicts the article's "don't ban up front." Worth measuring, not assuming. Soft-steer was removed from TELLS' knobs for this reason |
| 7 | **Diversity metrics for fan-outs** (NoveltyBench, Infinity-Chat) | A measurable gate on `xN[SEED]` | Replaces "judge the spread by eye" with a number; tells you when N is large enough or when to re-roll | An evaluation tool, not a technique |
| 8 | **Harness pruning as models improve** (Anthropic harness, 2026) | The other half of `BANK` | BANK re-tests failed prompts to become *more* ambitious. Pruning re-tests whether a block is still *needed* at all | The opposite move from the article's re-testing habit; not discussed there |

---

## A. Other ways to get diversity (alternatives to SEED / VISION)

- **Verbalized Sampling**: ask the model for k responses with probabilities and sample from the tail. *Off-path: draws diversity from the model's own distribution rather than from external entropy or human taste.* [arXiv 2510.01171](https://arxiv.org/abs/2510.01171)
- **Decoding-time tweaks** (temperature, min-p): change the sampler. *Off-path: TinyStories shows high temperature alone stays repetitive, and agent users often can't set these anyway.* [arXiv 2407.01082](https://arxiv.org/abs/2407.01082)
- **Training-time diffuse-distribution fine-tuning**: train the model to spread probability over valid outcomes. *Off-path: needs training access.* [arXiv 2404.10859](https://arxiv.org/abs/2404.10859)
- **SSoT for probabilistic instruction following**: the other half of the SSoT paper, sampling faithfully from a *specified* distribution (simulations, randomized assignment). *Off-path: calibrated probabilities over fixed options, not creative divergence.* [arXiv 2510.21150](https://arxiv.org/html/2510.21150v3)
- **Quality-Diversity search with AI feedback (QDAIF)**: a MAP-Elites archive where LMs both generate and judge quality and diversity. *Off-path: effectively a fused SEED+CRITIC search algorithm.* [arXiv 2310.13032](https://arxiv.org/abs/2310.13032)
- **Post-hoc diversity filtering**: over-generate, then deduplicate by embedding distance. *Off-path: selection after generation, not injection before it.* (C2 uses a light version as `dedupe` glue, explicitly not a block.)
- **Model swapping / ensembles / base models**: *Off-path: changes the generator. The Artificial Hivemind work suggests swapping between aligned models buys less variety than expected.* [arXiv 2510.22954](https://arxiv.org/abs/2510.22954)
- **Prompt paraphrasing / prompt ensembles**: *Off-path: weaker than SSoT in head-to-head tests.*
- **Persona, chain-of-thought and named-method prompting for idea variance** (Meincke, Mollick & Terwiesch 2024): *Off-path: widens the AI's own list without human steering.* [arXiv 2402.01727](https://arxiv.org/pdf/2402.01727)
- **Random remote cross-domain mapping**: force an analogy from a randomly assigned distant source. *Evidence on SEED's ⟨A⟩ deck variant:* LLMs didn't benefit on average, while humans did. This is why the deck mode is marked as a variant with mixed evidence. [arXiv 2603.19087](https://arxiv.org/abs/2603.19087)
- **Oblique-Strategies-style provocation decks**: beat ChatGPT on cross-user idea distinctness. *Evidence on SEED's ⟨A⟩ deck variant, from a human-only setting.* [arXiv 2402.01536](https://arxiv.org/html/2402.01536v2)
- **Analogy-driven problem reformulation**: use LLM analogies to *reframe the problem* before solving it. *Off-path: targets problem definition, not the build vision. Could become its own upstream block.* [Fluid Transformers, C&C 2023](https://ar5iv.labs.arxiv.org/html/2302.12832)

## B. Critic and judge variants

- **Self-Refine** (same-model critique loop): about +20% on 7 tasks. *Off-path: the article argues against self-review. At most it could be a cheap inner loop inside the worker.* [arXiv 2303.17651](https://arxiv.org/abs/2303.17651)
- **Panel of LLM judges (PoLL)**: a jury of smaller judges from different model families. *Off-path: contradicts single-big-critic tiering.* [arXiv 2404.18796](https://arxiv.org/abs/2404.18796)
- **Pairwise tournament ranking (PairS)**: [arXiv 2403.16950](https://arxiv.org/abs/2403.16950)
- **Scored few-shot calibration**: see shortlist #5.
- **LLM-judge bias controls** (length control; position swapping is already in v1 as a CRITIC knob): [arXiv 2306.05685](https://arxiv.org/abs/2306.05685); length-controlled AlpacaEval: [arXiv 2404.04475](https://arxiv.org/abs/2404.04475)
- **Advisor strategy**: a cheap executor calls a strong advisor in the middle of a task. *Off-path: the advisor sees the process and advises on approach, the opposite of a blind, artifact-only critic. Only the tiering economics carry over.* [Claude blog, Apr 2026](https://claude.com/blog/the-advisor-strategy)
- **Trained error-localization classifiers / reward models**: *Off-path: requires training.* [arXiv 2311.08516](https://arxiv.org/abs/2311.08516)
- **Interactive evaluator + planner-generator-evaluator harness with sprint contracts**: the evaluator clicks through the live app with Playwright, and "done" criteria are negotiated per sprint. *Off-path: a heavier, multi-hour architecture beyond the screenshot-only critic.* [Anthropic, Mar 2026](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- **Dynamic orchestrator-workers**: an LLM builds the configuration at runtime. *Off-path: the article's configurations are fixed and written by a human. An LLM assembling the legos itself would be a different system.* [Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)

## C. Correctness and verification (the bar CRITIC doesn't cover)

- **Tool-grounded verification (CRITIC paper)**: verify outputs with search, code execution and checkers, then revise. See shortlist #1. [arXiv 2305.11738](https://arxiv.org/abs/2305.11738)
- **Program-aided reasoning (PAL)**: offload computation to an interpreter. *Only the narrow "compute and render the chart" case is in ASSET.* [arXiv 2211.10435](https://arxiv.org/abs/2211.10435)
- **Deterministic verification gates** (stop hooks, `/goal` conditions): block "done" until a scripted check passes. [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- **Retrieval-grounded writing** (RAG, sourced quotes, real data pulls): *Off-path: acquiring facts, not commissioning an asset.*
- **Real-user research and small-scale testing as gates**: the Double Diamond's Discover research and Deliver testing. *Off-path: the article's judges are the author and an AI critic.* C5 may use **live A/B results to recalibrate its gate**, but only as an optional external dependency. [Design Council](https://www.designcouncil.org.uk/resources/framework-for-innovation/)
- **Spec-only tests with a hidden mutation-score bar** (moved out of C7): a separate agent writes tests from the spec; the implementer can't edit them; mutation score is the bar. *The natural first `VERIFY` configuration.*

## D. Generation infrastructure and specialist tooling

- **Autonomous model routing** (HuggingGPT-style): *Off-path: the article's move is human-directed ("name the tool").* [arXiv 2303.17580](https://arxiv.org/abs/2303.17580)
- **OAuth/MCP access to generator catalogs** (fal's hosted MCP: `search_models`, `get_pricing`, `recommend_model`): keeps credentials out of prompts and files. *A likely successor to the `.env.agents` key pattern.* [fal docs](https://fal.ai/docs/model-apis/mcp)
- **Enterprise secrets governance** (vaults, short-lived tokens, non-human-identity inventory): far heavier than the article's dev-key hygiene. [GitGuardian 2026](https://dev.to/gitguardian/the-state-of-secrets-sprawl-2026-ai-service-leaks-surge-81-and-29m-secrets-hit-public-github-2bgj)
- **Native transparency generation** (LayerDiffuse; TransPixar for RGBA video): would replace RELAY's render-then-extract stage. [arXiv 2402.17113](https://arxiv.org/abs/2402.17113) · [arXiv 2501.03006](https://arxiv.org/abs/2501.03006)
- **Model-internal long-video memory** (StreamingT2V): architecture work; RELAY borrows only "keep chains short; use B0 or identity references." [arXiv 2403.14773](https://arxiv.org/abs/2403.14773)
- **Chain of Agents**: sequential worker handoff for *comprehension* of long inputs. Same handoff shape, different purpose. [arXiv 2406.02818](https://arxiv.org/abs/2406.02818)
- **RecurrentGPT's human-editable memory**: an interactive co-writing loop. [arXiv 2305.13304](https://arxiv.org/abs/2305.13304)
- **Raster → vector** (StarVector), **multi-step visual editing chains** (Visual ChatGPT), **video-to-video restyling / motion transfer**, **classical frame interpolation**: adjacent asset pipelines.
- **Authored motion** (Rive, Lottie, shaders): a competing route to stateful motion, by authoring rather than generating.
- **Text and data state handoff between generalist LLM calls** (each section starts from the last section's closing paragraph; each step starts from the last step's end-state JSON). It has the same `~>` shape as RELAY, but it is ordinary prompt chaining, not a specialist relay, so it was removed from RELAY's fit table.
- *(Scroll-scrub engineering is now an implementation tip inside RELAY step 5.)*

## E. Anti-slop at the model or sampler level, and detection

- **Antislop Sampler + FTPO fine-tuning**: backtracking suppression of thousands of patterns, or training them out of the weights. *Off-path: needs inference or weight control, and removes per-instance human judgment.* [GitHub](https://github.com/sam-paech/auto-antislop)
- **Direct Principle Feedback**: fine-tune models so that "don't mention X" actually works. *The opposite lever from audit-after.* [arXiv 2402.07896](https://arxiv.org/abs/2402.07896)
- **Statistical tell-fingerprinting**: rank n-grams and structures by frequency relative to a human corpus (Kobak et al.; the Antislop pipeline). *A rigorous way to build the TELLS catalog; a project in its own right.* [arXiv 2406.07016](https://arxiv.org/abs/2406.07016)
- **Corpus-level excess-vocabulary monitoring** across an organization's writing.
- **Tells as linter rules** (Vale; custom ESLint/Ruff rules): *useful as a hit-finder, but hard-failing lint drifts toward the bans the article warns against.* [vale.sh](https://vale.sh)
- **AI-text detectors and "humanizer" tools**: *the opposite of the protocol's goal. A majority vote of heavy-LLM-user readers still caught humanized text (Russell et al. 2025).*
- **Provenance / watermarking / "AI accents"**: [arXiv 2206.07271](https://arxiv.org/abs/2206.07271v4)
- **Slop taxonomy as a quality rubric** (density, relevance, coherence, templatedness): *better suited to a CRITIC rubric than to the TELLS catalog.* [arXiv 2509.19163](https://arxiv.org/abs/2509.19163)

## F. Up-front steering (contrasts with the article's "fix after" approach)

- **Pre-loaded aesthetic skills / avoid-lists**: see shortlist #6. [frontend-design SKILL.md](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
- **Generation-time brevity / anti-over-engineering prompts**: vendor-recommended. *Complements CUT, can't replace it (the article's calorie app was asked for "minimalist" and still came out cluttered).*
- **Subject-vernacular grounding + agent self-review of the plan**: near-domain inspiration plus self-review. *Self-review is what CRITIC exists to avoid.*
- **Content-first design**: write real copy before layout. *Reorders the process instead of adding a late rewrite.*
- **Personal voice models** (fine-tune or style-transfer on the owner's corpus): *customizes the generator, against the article's "by hand."*

## G. Measuring the protocol itself

- **NoveltyBench-style diversity scoring of fan-outs**: see shortlist #7.
- **Homogeneity benchmarking of your own prompts** (Infinity-Chat): [arXiv 2510.22954](https://arxiv.org/abs/2510.22954)
- **Tool-use failure audits** (ToolFailBench: Tool-Skip, Result-Ignore, Output-Fabrication): [arXiv 2607.04686](https://arxiv.org/abs/2607.04686)
- **Design-capability benchmarking** (Graphic-Design-Bench): shows which design subtasks generalists can't do natively, and therefore which slots ASSET must delegate. [arXiv 2604.04192](https://arxiv.org/abs/2604.04192)

## H. Process, governance and adjacent disciplines

- **Harness pruning as models improve**: see shortlist #8.
- **Automated prompt optimization** (APE and successors): *metric-driven prompt search tends to bring averaging back.* [arXiv 2211.01910](https://arxiv.org/abs/2211.01910v2)
- **Delta debugging / automated reduction** and **dead-code detection**: mechanical, oracle-driven subtraction for code; could speed up CUT there. [debuggingbook](https://www.debuggingbook.org/html/DeltaDebugger.html)
- **Prompt compression**: subtraction applied to model *inputs* for cost, not to outputs for taste.
- **Leidy Klotz, *Subtract***: subtraction across organizations and policy.
- **Plain-language standards / readability scoring**; **content design and UX-writing systems** (voice and tone guides): adjacent disciplines that VOICE borrows its direction from.
- **AI disclosure strategy** (the "transparency dilemma", Schilke & Reimann 2025): governance, separate from the craft of rewriting.
- **Human-side and cultural homogenization**: whether people's own taste converges after exposure to LLM output, and whether "human-like" stays a stable reference for TELLS catalogs over time.

## I. From the use-case research

- **`VERIFY`, a ninth block for checking claims against sources.** This is a non-blind step that checks every factual claim and citation against its source. Deep-research citation accuracy runs at 40–80% (DeepTRACE), and fabricated sources turned up in a Deloitte government report. It is the prerequisite for any research or analysis configuration, which is why "AI analyst reports" was rejected as a use case for now. See shortlist #1. [arXiv 2509.04499](https://arxiv.org/abs/2509.04499v1)
- **A block that grounds personalization in the recipient and context.** For outreach, relevance drives replies, not style (Hunter 2025). Personalization works when it is grounded in the recipient's traits (Matz et al.), and models plateau at predicting which outreach succeeds (SDR-Bench). *This is a missing research capability, not a T1–T8 generalization.* [Hunter](https://hunter.io/the-state-of-cold-email-2025)
- **Learned critics and reference sets as the engine behind CRITIC.** UIClip scores 75.1% vs. GPT-4V's 51.6%. UICrit improves critique quality by 55% with few-shot visual examples. The WQRM writing-quality reward model won 66% expert preference. Design Arena's head-to-head preference data could serve as the critic or as its reference bar. **Whether CRITIC works at all on visuals and prose depends on this.** [arXiv 2404.12500](https://arxiv.org/abs/2404.12500)
- **Diversity metrics across a portfolio of outputs.** Moon et al.'s diversity growth rate and embedding-similarity measures. Used **optionally and experimentally** in C3 (structure-level features only), alongside the default human portfolio review. Validation is pending. [Moon et al.](https://consensus.app/papers/details/a5b284839107586aad3281027dafa51b/)
- **A commercial proof experiment for C1.** Run an A/B or panel test with two arms: (1) default AI-builder output vs. the same page after Studio; (2) Studio with `structure=free` vs. `structure=conservative`. Measure trust, recall, first-impression aesthetics and conversion. *No such study exists. Running one would close the biggest gap for the article's own use case.*
- **Calibrating how SEED is implemented.** Compare external seed strings head to head against verbalized sampling, random-concept infusion (arXiv 2601.18053), chain-of-thought idea prompting and personas, on both diversity and quality. This decides which divergence mechanism the protocol standardizes on.
- **Executable enforcement for code tells (ContextCov).** It compiles AGENTS.md rules into AST, shell and architecture checks. Constraint compliance was 88.3%, vs. 67.0% with prompts alone and 50.3% with LLM reflection. *This is how TELLS could be implemented in C7.* [ContextCov](https://consensus.app/papers/details/fab8fe74aeeb5884be3cb115a030ee0b/)
- **The disclosure paradox and how to position TELLS and VOICE.** People say AI use should be disclosed but penalize content that discloses it (Schilke & Reimann; Sahebi et al.). IAB finds that for 73% of young consumers, clear disclosure raises purchase intent or leaves it unchanged. This shapes how the protocol *describes* TELLS and VOICE (quality and ownership, never evasion).
- **Culturally grounded divergence and voice.** AI writing suggestions pulled Indian writers toward Western styles (Agarwal, Naaman & Vashistha, CHI 2025). Seeds, reference sets and VOICE guidance may need to be culture-specific. [arXiv 2409.11360](https://arxiv.org/abs/2409.11360)
- **An accessibility audit as a sibling of TELLS.** Models know WCAG but skip it unless prompted. White-on-white and low-contrast text show up among observed AI UI failures. *It could be added to C1's audit and to the critic's rubric.*
- **Vendor and open-source tooling that implements RELAY Pattern B** across many shots: anchor portraits, start frames, voice references (e.g., dawndrain/movie-gen). [GitHub](https://github.com/dawndrain/movie-gen)
- **Organizational adoption levers for C4.** Team trust is associated with 61% less workslop. Leadership communication about AI is associated with 21× more healthy adoption (BetterUp 2026). Organizational factors outweigh individual effort 2× (Microsoft WTI 2026).
- **Deskilling and erosion of critical thinking.** More confidence in GenAI goes with less critical thinking (Lee et al., CHI 2025). The human steps in VISION and VOICE might mitigate this, but that's untested. [PDF](https://advait.org/files/lee_2025_ai_critical_thinking_survey.pdf)
- **Use cases that still need their own research sweep:**
  - **E-commerce listings and product photography at scale.** High volume and sameness across sellers. The ASSET photography job is legitimate here and conversion is felt directly. Possibly a C5 Still fit, or the §J Platform Guardrail channel candidate.
  - **Organic creator video.** Needs the same screen for evasion risk that was applied to SEO.

## J. Channel candidate: Platform Guardrail

*This was configuration C8 in an earlier draft. It moved here because it depends mostly on capabilities outside the eight blocks and has no human taste in the loop. That puts it outside the user's "don't veer far off the article" scope, but it is the likeliest **distribution channel** for these blocks (AI app builders, coding-agent vendors, skill authors).*

**The problem.** Millions of users send similar thin prompts to the same models, so each platform's output becomes a recognizable look. A single generation can't see its siblings, so "never converge across generations" can't be followed from inside one run (Wetch 2026; anecdotal, judged by a model from the same family). Homogenization concentrates at the prompt and refine stages (Shin et al. 2026). Scale: Lovable had about 100k new projects a day in Nov 2025, and about 200k by May 2026.

**Sketch (wiring with external dependencies marked):**
```
D1:: xN[ SEED(hash(project_seed, i)) > generate ]          seed fixed at project creation, outside the model
     (VISION sits out: replaced by a non-block onboarding menu of style "subfloors")
D2:: each[ ASSET routing (no CSS blobs) > RELAY?(premium tiers) ]
     > pick(C,1)   EXTERNAL: a learned or calibrated UI-quality ranker (UIClip-style), not the article's critic loop
     > EXTERNAL: cross-project similarity check against recent sibling outputs (re-roll if too close)
D3:: CUT(default trim) > TELLS(visual/layout and code-defect detectors only) > VOICE-flag(mark placeholder copy for the user to rewrite)
offline:: recalibrate the catalog and ranker on human preference data, BANK
```

**Guardrails it would need.**
- Automatic TELLS swaps limited to visual, layout and code-defect catalogs. **Prose tells are only flagged, never auto-rewritten.**
- Never used for bulk text generation (SEO or programmatic pages).
- Platform AI labels and provenance metadata are preserved.
- Each branch's seed is hashed so the strings differ throughout. Seeds like `project_seed + i` share almost every character and invite lazy mapping.

**Why it isn't in v1.** It rests on a learned ranker (§I), a cross-project similarity metric (#7, §I), best-of-N selection (#3) and preference-data recalibration (#5). None of these is an article technique.
