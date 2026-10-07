# ux

## Summary
Recommendation: build two separate faces on one engine. The operator face is "Lab", a local-first web app for running studies (the name avoids a clash with C1 "Studio"). The rater face is "Judge", a small hosted web app that Prolific participants and experts open from a link. Judge cannot be local-only, because participants must reach it over the internet. The user works on Windows, so "Apple-grade" should mean Apple's quality bar in a cross-platform browser app, not a native macOS app. Use the system-ui font stack (Segoe UI on Windows, SF on Mac) and support dark mode.

Lab hides the block grammar behind three layers, never more than two levels of disclosure. NN/g reports that designs with more than two levels usually test poorly.
- **Recipes:** the eight configurations shown as cards with plain names.
- **Steps:** each recipe drawn as a three-stage strip, Explore → Refine → Finish, with on/off toggles for steps. This makes leave-one-out ablation a single click.
- **Wiring diagram:** read-only, optional, with protocol codes shown only when "Show technical names" is on.

The pattern follows ComfyUI's App Mode: authors keep the graph, and operators get a focused app with only the key inputs.

Study setup is a single "Study sheet" filled in from a Paper-1 template. NN/g warns that step-by-step wizards fail when the steps depend on each other, and these do. The sheet has a live receipt-style sidebar for cost and statistical power, and a "Lock plan" button for pre-registration. After locking, any edit creates a new version.

Monitoring borrows from four tools:
- a tasks × variants grid (promptfoo's matrix view, GitHub Actions' run graph);
- a per-run timeline that groups events into collapsible rounds (Temporal's compact, timeline and full-history views);
- progress bars that show real progress, with pause and cancel (Apple HIG);
- a "Your turn" inbox for human checkpoints. Here the variant labels are hidden, so the operator's own taste can't leak into a condition.

Comparison offers several views:
- a contact sheet of all drafts for one task, which makes sameness obvious at a glance;
- 2-up with synced scroll, Flip, Swipe and Overlay (GitHub's image diff, Figma's compare);
- a blind toggle, so a pilot judgment is made before labels are revealed (Chatbot Arena reveals models only after the vote);
- deltas against a chosen baseline with improvement and regression counts (Braintrust).

The Judge interface is where data quality is won or lost:
- **Presentation:** pairs are anonymous, sides are randomized and counterbalanced, and both items are preloaded and revealed together (Design Arena's control against speed bias). The page has neutral, fixed framing, and prose is shown in identical typography (LMArena found length and markdown formatting bias votes).
- **Choices:** "Left / Can't decide / Right" with arrow-key shortcuts and a 3-second undo.
- **Quality checks:** "check pairs" (one item deliberately broken) placed early, plus repeat pairs with sides swapped. Each rater is scored on left-pick rate, timing and tab-switching. The rules for excluding raters are set before launch and follow Prolific's check policy.
- **Device and pay:** desktop-only is enforced inside the app, because Prolific's device setting is advisory only. Pay is at or above Prolific's recommended £9/$12 per hour.
- **Pairing:** the confirmatory study uses a fixed, balanced, pre-registered pairing schedule. Adaptive pairing can inflate reported reliability (0.97 reported vs 0.82 all-play-all in a comparative-judgement study).
- **Accessibility:** WCAG 2.2 AA throughout, including a way to turn off single-key shortcuts.

The full vocabulary map and the screen-by-screen layout are below. Seven questions need the user's decision, the main ones being:
- ethics approval;
- who performs C1's human steps during the experiments;
- the exact rater question and response format;
- the target venue.

## Recommendations
### Overall product shape: two faces, one engine [high]
Build two separate web apps on one backend. LAB is the operator app: local-first, opened in a desktop browser, single user or a small team. JUDGE is the rater app: hosted publicly, deliberately minimal, separate origin, and it receives only anonymized assets by opaque ID. Lab never shares a URL, file name or metadata path with Judge. Judge must be on the internet, because Prolific sends participants to an external study URL and gets them back through a completion redirect. 'Local-first' therefore applies to Lab only. Don't build a native macOS app: the owner is on Windows, raters use any desktop browser, and Apple-grade is a quality bar, not a platform.
- Why: Keeping the rater app separate protects validity (raters can't find out which condition made an item) and keeps it simple. Prolific's integration model is an external URL that receives PROLIFIC_PID, STUDY_ID and SESSION_ID and redirects back on completion. Apple's own principles (Simplicity: 'every element earning its place'; Flexibility: 'support as many devices…as possible') argue for craft over platform lock-in.
- Src: https://researcher-help.prolific.com/en/article/fbbd36; https://developer.apple.com/design/human-interface-guidelines/design-principles

### Hiding the block grammar: recipes over raw graphs [high]
Three layers, never more than two clicks deep:
- **Layer 1, Recipe card:** a plain name, a one-line promise, 'Try it' (a single run) and 'Test it' (a new study).
- **Layer 2, Steps strip:** the recipe drawn as Explore → Refine → Finish, with step chips (Random spark, Outside critique, Custom imagery…). Each chip has an on/off toggle and a 'Who does this?' control (You / Automatic stand-in / Skip). A sheet holds settings such as rounds, models and the hidden quality bar.
- **Wiring diagram:** read-only, reached from an 'i' button, with protocol codes as small monospace tags shown only when Settings → 'Show technical names' is on.

Don't ship a node editor in v1. Recipes are versioned files, and an expert edits a recipe by duplicating it in the Library.
- Why: NN/g: progressive disclosure works when everything frequently needed is up front, and designs with more than two levels 'typically have low usability'. Node-graph tools are moving toward an app layer for operators. ComfyUI's App Mode (Mar 2026) makes 'the node diagram vanish', exposing only designated inputs because sharing node graphs 'proved challenging'. Runway's Workflows (Oct 2025) shows the graph-first approach is fine for authors but not for operators. A toggle per step makes leave-one-out ablation one click, which matches Paper 1.
- Src: https://www.nngroup.com/articles/progressive-disclosure/; https://comfyui.org/en/from-workflow-to-app-introducing; https://alternativeto.net/news/2025/10/runway-launches-node-based-workflows-for-building-custom-ai-creative-pipelines

### Plain-language vocabulary (replace protocol jargon) [medium]
**Stages:** D1 Diverge → **Explore** · D2 Deepen → **Refine** · D3 Distill → **Finish**.

**Blocks** (chip name, then a one-line explainer):
- SEED → **Random spark**: 'each draft starts from a different random string so drafts don't all look alike'
- VISION → **Your direction**: 'you give a bold reference; it becomes the brief'
- CRITIC → **Outside critique**: 'a stronger model sees only screenshots, names the biggest gaps; the builder revises until a bar the critic never sees is met'
- ASSET → **Custom imagery**
- RELAY → **Motion**
- CUT → **Trim**
- TELLS → **Cliché sweep**
- VOICE → **Your words**

**Glue and operators:**
- ?H → **Your turn**; pick → **Choose favorites**; option_set → **Drafts**
- xN → **Make N drafts**; xN as a diagnostic → **Sameness check**
- RENDER/view → **Screenshot**; critique → **Critic notes**
- score + !hidden threshold → **Quality bar (hidden from critic)**; GREAT/refs → **Compare against references**
- probe/max/plateau → **Stop rules** ('up to 5 rounds; stop early if it stops improving'); loop iteration → **Round**
- TIER big/mid → **Judge model / Builder model**; KEYS → **Connections**
- BANK → **Retry shelf**; BRIEF → **Brief**; lite → **Quick mode**
- << D1 → **Start over with a new spark**; ↺ → **Auto-retry once**
- gate / CRITIC-check → **Final defect check**
- route(entry) → **How to start**: Random spark / Your reference / Guided direction / From Idea Generator
- port rules → **Guardrails**, shown as lock badges such as 'Critic sees screenshots only'
- Ports never appear in the UI.

**Configurations → Recipes:** C1 Landing Page Studio · C2 Idea Generator · C3 Series Writer · C4 Memo Polish · C5 Ad Video Chain · C6 Second Reader · C6a Fiction Second Reader · C7 Lean Code Review.

**Experiment terms:** Study; **Variant** (the UI word; tooltip and paper exports say 'condition'); **Skip-one test** (leave-one-out ablation); **Baselines** 'Plain prompt' and '"Be creative" prompt'; Task; Repeats; Judging round; Rater; Pair; **Check pair** (gold/attention item); Exclusion rules; **Lock plan** (pre-registration).

Exports and the Paper kit always include a glossary that maps plain names to protocol codes.
- Why: Apple's writing guidance says to 'choose simple, plain language… avoiding jargon', 'build language patterns' and use the same terms throughout multi-step flows, with verbs on buttons. Superhuman's command-palette guidance recommends showing synonyms, e.g. 'Mark Done (Archive)'. That is how protocol codes can stay searchable in Cmd/Ctrl+K without cluttering the UI. The operator face is named Lab, not Studio, because C1 is already called Studio.
- Src: https://developer.apple.com/design/human-interface-guidelines/writing; https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/

### Lab information architecture (operator face) [high]
**Sidebar, six items:**
1. **Home:** the 'Your turn' inbox, live runs, recent results.
2. **Recipes:** a gallery of 8 cards, each with a detail page.
3. **Studies:** each study has tabs Plan · Runs · Outputs · Judging · Results · Paper kit.
4. **Runs:** a dense global activity list with status grouped and filters for study, recipe, status and natural-language search.
5. **Judges:** pools of people, experts and AI judges, plus judging rounds and rater health.
6. **Library:** task sets, references, rubrics, check pairs, the Retry shelf and recipe versions.

Settings (gear icon) holds Connections (each key with a test call and a spend cap), default models, budgets, export and 'Show technical names'.

Cmd/Ctrl+K works everywhere and searches every object and action, including protocol codes as synonyms.

**Contexts:** 'Playground' (free experimentation) and 'Studies' (locked) are visually distinct contexts, like Arc's Spaces. A locked study shows a lock badge, and editing it creates a new version.
- Why: Vercel's 2026 navigation redesign moved tabs into a hideable sidebar, ordered items by 'the most common developer workflows', and used 'projects as filters' to switch scope in one click. Linear's redesign aimed to 'reduce visual noise' and 'increase the hierarchy and density' of navigation. A command palette scales where a sidebar can't: 'putting everything in one place simplifies the mental model'. Arc's Spaces keep separate contexts from bleeding into each other, which here protects locked studies from playground edits.
- Src: https://vercel.com/changelog/dashboard-navigation-redesign-rollout; https://linear.app/blog/how-we-redesigned-the-linear-ui; https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/; https://blakecrosley.com/guides/design/arc

### Study setup flow: a 'Study sheet' prefilled from templates, not a wizard [high]
'New study' opens a template picker:
- Does a recipe beat plain prompting? (replication)
- Which steps matter? (Skip-one tests)
- Paper 1: both
- Does it generalize? (Paper 2: C3 / C6a / C2)
- Blank

The template fills one scrollable sheet with eight sections: (1) Question; (2) Variants; (3) Tasks; (4) Repeats; (5) Human steps; (6) Judging (people / experts / AI judges / automatic metrics); (7) Exclusion rules; (8) Analysis plan.

For Paper 1 the Variants section is filled with Plain prompt, 'Be creative' prompt, the full Landing Page Studio recipe, and one Skip-one variant per step. Each is drawn as the recipe strip with the skipped step greyed out.

A sticky right-hand sidebar works like a checkout receipt. It shows itemized estimated cost (generation, images, critic rounds, AI judges, rater pay plus platform fee, contingency) as low–high ranges, total outputs and judgments, the power estimate, and warnings.

The primary button is 'Run pilot' (one task × all variants). 'Lock plan & launch' follows. Locking freezes recipe versions, prompts, models, seeds policy and the analysis plan into a hashed snapshot that can be exported to a pre-registration.
- Why: NN/g: staged disclosure (wizards) is 'problematic when the steps are interdependent'. In a study, variants, tasks, repeats and judging all drive cost and power together, so one sheet with a live summary fits better. Apple's onboarding guidance says to 'provide reasonable default settings so most people can immediately start', which is what templates do. Showing an itemized cost before spending implements decision 4 (budget from a power analysis, cost shown before spending).
- Src: https://www.nngroup.com/articles/progressive-disclosure/; https://developer.apple.com/design/human-interface-guidelines/onboarding

### Run monitoring and timelines [high]
**Study level:** a tasks × variants grid. Each cell shows a status icon plus label (never color alone), a thumbnail of the latest screenshot and a rounds counter ('Round 2 of up to 5'). Above it sit a study-level progress bar with an ETA range and a spend meter against the cap. Runs auto-pause at the cap, and Pause and Cancel are always visible.

**Run detail:** a vertical timeline grouped by stage:
- **Explore:** spark → direction text.
- **Refine:** one collapsible group per round with the screenshot, critic notes and score. A dashed line marks the hidden bar, shown to the operator only, with a 'critic never sees this' badge.
- **Finish.**

A filmstrip shows screenshots round by round. A 'Details' disclosure holds prompts, raw I/O, tokens, cost and timing. Failures appear in plain language with 'Retry this step'. Branching from a step is allowed only in Playground.

**'Your turn' cards:** human checkpoints show drafts in random order with variant labels hidden, and the time each decision took is logged.
- Why: Apple HIG on progress: prefer determinate indicators, 'keep progress indicators moving', avoid uneven pacing that 'can feel deceptive', and 'when it's feasible, let people halt processing'. Temporal's UI groups related events and offers compact, timeline and full-history views, so people 'understand what's happening, right now' and drill down only when debugging. GitHub Actions' real-time job graph shows status and lets you click a job to open its log. Inspect's log viewer shows a live view with 'incremental metric calculations'. Hiding labels at human checkpoints keeps the operator's taste from becoming a confound between conditions.
- Src: https://developer.apple.com/design/human-interface-guidelines/progress-indicators; https://temporal.io/blog/the-dark-magic-of-workflow-exploration; https://docs.github.com/en/actions/how-tos/monitor-workflows/use-the-visualization-graph; https://inspect.aisi.org.uk/log-viewer.html

### Side-by-side comparison patterns (operator) [high]
The Outputs tab has five views:
1. **Contact sheet:** one task, all variants × repeats, tiled at above-the-fold size. This is the Sameness check that makes mode collapse visible; an optional automatic similarity score sits beside it.
2. **Pair view:** modes 2-up with synced scroll, Flip (Space toggles both pages in the same spot), Swipe and Overlay. A Desktop | Mobile | Fold switch sits alongside.
3. **Blind toggle:** hides labels until you pick, then reveals, so pilot impressions aren't contaminated.
4. **Round-by-round:** the first round against the final round of the critic loop.
5. **Table:** a baseline selector, per-task deltas, 'X improvements / Y regressions' counts, and a summary grade (Improvement / Regression / Tradeoff / Tie).
- Why: GitHub's image diff offers 2-up, swipe and onion-skin modes for different kinds of difference. Figma's compare offers side-by-side and an overlay that makes 'smaller edits stand out'. Braintrust aligns cases against a chosen baseline, colors deltas and counts improvements and regressions. Chatbot Arena reveals identities only after voting to avoid brand bias, and the same applies to the operator's own impressions.
- Src: https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files; https://help.figma.com/hc/en-us/articles/15023193382935; https://www.braintrust.dev/docs/evaluate/compare-experiments; https://arxiv.org/html/2403.04132v1

### Empty states and first run [high]
No screen is ever blank:
- **Home with no studies:** 'Run the sample study' (one bundled product brief, Quick mode, with an estimated cost and time) and 'Start Paper 1 from template'.
- **Connections:** each provider row has 'Add key → Test → Set spend cap'.
- **Runs:** explains what will appear and links to 'New study'.
- **Judges:** 'Your outputs need judges — choose people, experts, AI judges, or metrics'.
- **Results before data:** shows the locked analysis plan with placeholder charts.

Setup that isn't needed yet is deferred: only the providers a chosen recipe needs are requested.
- Why: NN/g: empty states should communicate system status, give learning cues and offer 'direct pathways' for key tasks. Apple: 'provide clear next steps on any blank screens', 'postpone nonessential setup flows', and 'teach through interactivity'.
- Src: https://www.nngroup.com/articles/empty-state-interface-design/; https://developer.apple.com/design/human-interface-guidelines/onboarding; https://developer.apple.com/design/human-interface-guidelines/writing

### Apple HIG principles to adopt as design acceptance criteria [high]
Use Apple's current eight principles as a review checklist for every screen:
- Purpose
- Agency: undo everywhere it's safe, and clear consequences where it isn't (locking a plan, spending money)
- Responsibility: show cost before spending; keys are scoped and capped
- Familiarity: standard shortcuts, never repurposed
- Flexibility: keyboard and mouse, light and dark
- Simplicity: every element earns its place
- Craft: alignment, density, 60fps, interactions under 100 ms
- Delight: restrained motion, satisfying completion moments

Add custom keyboard shortcuts only for the few most frequent actions:
- Lab: J/K to move through outputs, Space to flip, B for blind, Cmd/Ctrl+K for commands.
- Judge: ←/→ to choose, ↓ for Can't decide, Space to flip, Z to undo.

Respect Reduce Motion: Flip becomes an instant swap, with no blur transitions.
- Why: Apple's design-principles page now lists Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft and Delight. It adds 'help people recover from mistakes' and 'provide clear feedback'. The keyboard guidance says to 'define custom keyboard shortcuts for only the most frequently used app-specific commands' and not to repurpose standard ones. The accessibility guidance covers Reduce Motion, contrast, and 'convey information with more than color alone'. Things 3 shows how 'little delights' and keyboard type-to-search raise perceived quality without adding features.
- Src: https://developer.apple.com/design/human-interface-guidelines/design-principles; https://developer.apple.com/design/human-interface-guidelines/keyboards; https://developer.apple.com/design/human-interface-guidelines/accessibility; https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/

### Judge information architecture (rater face) [high]
Ten linear screens with no navigation chrome:
1. Entry from a Prolific or expert link.
2. Device and window check: desktop, viewport at least 1280×720, browser zoom at 100%. If the check fails, show a polite 'please return / switch device' page.
3. Consent: one screen covering pay, time and data use.
4. 'How it works': three cards.
5. Interactive practice: two pairs made of human-made items unrelated to the study tasks, with explanatory feedback.
6. Comprehension check: re-readable instructions, two attempts; on failure the participant is asked to return the study and is not rejected.
7. The judging loop: N pairs. Progress reads 'Pair 12 of 36 · about 9 min left'. A 30-second break card appears at halfway.
8. End questions: design background, plus self-reported monitor size alongside the captured viewport.
9. Optional comment.
10. Automatic redirect to the completion URL.

The participant-facing name is neutral, e.g. 'Website Design Comparisons'. It never mentions methods, conditions or hypotheses.
- Why: Prolific's policy requires that participants can re-read key information for comprehension checks, get at least two chances, and are asked to return rather than rejected. It also says checks should come 'at the start of the study'. Prolific's device settings 'do not screen out participants', so enforcement has to happen in the app, as Gorilla does by blocking ineligible devices with an explanation page. Apple: teach through doing, not reading.
- Src: https://researcher-help.prolific.com/en/articles/445153-prolific-s-attention-and-comprehension-check-policy; https://researcher-help.prolific.com/en/articles/445149-how-do-i-restrict-participation-to-certain-devices; https://support.gorilla.sc/support/launching-your-study/recruitment-requirements; https://developer.apple.com/design/human-interface-guidelines/onboarding

### Judging screen: blind pairwise for web-page screenshots [high]
**Layout:** one constant question at the top, worded the same on every trial; the exact wording is the user's decision. Two frames labelled Left and Right on a fixed neutral background. The chrome does not follow system dark mode, so presentation stays the same for everyone.

**Items:** both are pre-rendered at identical width, format and compression, with metadata stripped. Both are preloaded and revealed at the same moment.

**Viewing:** Phase 1 shows the above-the-fold pair. Then 'Scroll to compare full pages' with synced scroll, so one scroll covers both. Space toggles Flip for spotting differences.

**Answering:** voting unlocks once both pages have been viewed to the bottom. Unlocking depends on scroll depth, not on a timer. Three large buttons (at least 44 px) in a fixed spot: 'Left is better' · 'Can't decide' · 'Right is better', with key hints (← ↓ →). After a choice, up to two optional reason chips such as 'More distinctive' or 'Easier to read'; crowd raters get no free text. The next pair loads automatically, with a 3-second Undo toast. No scores, no timers, no feedback after practice.

**Balance:** sides are randomized per pair and counterbalanced so every variant appears on the left 50% of the time.

**Mobile renders:** judged on desktop at 1:1 inside a device frame, never mixed with desktop renders in the same round.
- Why: Design Arena reveals results 'at the same time to prevent speed-based bias' and hides identities 'to prevent brand bias'. Chatbot Arena's anonymous pairs with tie and both-bad options are the established pattern. WebDev Arena saw 26% ties and 18% 'both bad', driven largely by broken builds, so broken renders should be caught by an automated plus human render check before judging and reported as a separate outcome. Lindgaard et al. found that 50 ms appeal judgments match longer viewing, which justifies a separate first-impression phase at the fold. Position bias in crowdsourced pairwise ranking is well documented, hence the counterbalancing.
- Src: https://notes.designarena.ai/methodology/; https://arxiv.org/html/2403.04132v1; https://arena.ai/blog/webdev-arena; https://www.nature.com/news/2006/060109/full/news060109-13.html; https://arxiv.org/abs/1605.05860

### Judging screen: prose pairs [high]
Render both texts in identical typography: the same font, size and roughly 65-character line length, with markdown normalized (headers, bold and lists either stripped or applied identically). Each text scrolls on its own, with a 'read to end' indicator per side. Record length and formatting features as covariates so the analysis can control for style. Where the design allows, match lengths across conditions or pre-register length as a covariate. For C6a fiction, prefer expert raters (for example writing teachers) over crowd raters. Show human-written reference passages in instructions only, never in the trial.
- Why: LMArena found that length is 'the dominant style factor', with markdown lists, headers and bold as second-order effects, and added style covariates to its Bradley-Terry model. Karpinska et al. found that crowd workers, even with strict filters, could not tell human from model stories, while English teachers could, and that showing references alongside outputs improved calibration.
- Src: https://lmsys.org/blog/2024-08-28-style-control/; https://aclanthology.org/2021.emnlp-main.97

### Rater data-quality controls built into Judge [high]
**Check pairs:** one side is deliberately broken (lorem ipsum, a collapsed layout, a missing hero). Put at least 3 per session, 2 of them in the first third.

**Exclusion vs rejection:** keep the two separate. Exclusion from analysis follows rules locked in the plan. Rejecting payment follows Prolific's rules: at least two failed checks for studies over 5 minutes, no memory or speed-based checks, no neutral options on nonsense items.

**Repeat pairs:** 2–3 pairs shown again with sides swapped, to measure each rater's consistency.

**Per-rater health in Lab:**
- check-pair accuracy
- left-pick rate, flagged by a binomial test
- median seconds per pair, flagging too-fast and alternating fast/slow patterns
- tab-away count, scroll depth, Flip use

**Session size:** 20–25 minutes and about 30–40 pairs, set from the pilot's median time. Pay at or above Prolific's recommended £9/$12 per hour, based on the pilot median.

**AI-assisted answers:** turn on Prolific authenticity checks only if free text is collected; otherwise use chips.
- Why: Zhu & Carterette (SIGIR CSE 2010) used identical-pair traps and found 'normal', 'periodic' and 'interrupted' timing patterns, plus fixed-response cheaters, in crowd preference judgments. Hata et al. (CSCW 2017) found worker quality 'extremely stable' over time and that the first few tasks predict long-term quality with about 3.4% error, which supports putting checks early. Veselovsky et al. estimated 33–46% of MTurk workers used LLMs on a writing task, detected through paste and keystroke signals. Prolific's authenticity checks watch copy-paste and tab-switching on free text, and its pay principles set a minimum of £6/$8 and a recommended £9/$12 per hour.
- Src: https://ai.ischool.utexas.edu/cse2010/materials/zhucarterette.pdf; https://ar5iv.labs.arxiv.org/html/1609.04855; https://arxiv.org/html/2306.07899v1; https://researcher-help.prolific.com/en/articles/445153-prolific-s-attention-and-comprehension-check-policy; https://researcher-help.prolific.com/en/articles/445144-what-are-authenticity-checks; https://researcher-help.prolific.com/en/articles/445230-prolific-s-payment-principles

### Pairing schedule exposed in the UI [medium]
Confirmatory judging rounds use a fixed, balanced, pre-registered schedule, generated and locked in Lab. Each comparison is balanced across task, variant pair and side, and every rater sees a balanced mix. Adaptive or active sampling, as Arena uses, is allowed only in rounds labelled 'Exploratory'. Expert panels get an optional 'Best & worst of 4' mode (best–worst scaling) for efficiency, analysed separately.
- Why: Vitello & Bramley (AEA-Europe 2017) found that adaptive comparative judgement reported a reliability of 0.97, while an all-play-all subset gave 0.82 and a non-adaptive study 0.70 with similar validity. Adaptivity inflates reported reliability. Chatbot Arena's active sampling is efficient (about 54% fewer samples) but is designed for leaderboards, not confirmatory tests. Best–worst scaling matched rating-scale reliability with about a third as many annotations.
- Src: https://www.cambridgeassessment.org.uk/Images/423984-the-effect-of-adaptivity-on-the-reliability-coefficient-in-comparative-judgement.pdf; https://arxiv.org/html/2403.04132v1; https://www.saifmohammad.com/WebPages/bwsVrs.html

### Accessibility baseline for both faces [high]
Target WCAG 2.2 AA:
- Both faces can be completed with the keyboard alone, and the focus ring is never hidden behind sticky bars (2.4.11).
- Targets are at least 24×24 px (2.5.8); use 44 px for vote buttons.
- The Swipe slider has a click or keyboard alternative (2.5.7).
- Single-key shortcuts can be turned off or remapped in a visible Judge settings menu (2.1.4).
- Text contrast is at least 4.5:1.
- Status uses icon plus label, never color alone.
- Reduce Motion is respected.
- UI text works at 200% zoom.

The screenshots themselves stay at fixed scale. Visual-design rounds state an eligibility requirement for normal or corrected vision, and this is declared in the paper. Prose rounds are screen-reader compatible.
- Why: These success criteria came in with WCAG 2.2 (2.4.11, 2.5.7, 2.5.8); 2.1.4 is a Level A criterion aimed at speech-input users, whose dictation can trigger single-character shortcuts. Apple's accessibility guidance adds contrast numbers, Reduce Motion behavior and 'convey information with more than color alone'. Accessibility failures in Judge also create unequal rater experiences, which adds noise.
- Src: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/; https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html; https://developer.apple.com/design/human-interface-guidelines/accessibility

### Results and Paper kit screens [medium]
The Results tab opens on the locked analysis only:
- a one-sentence answer with a confidence interval, e.g. 'Full recipe beat Plain prompt in 68% of comparisons (95% CI …)';
- a forest plot of variant strengths;
- a Skip-one chart ('how much worse without each step');
- secondary outcomes: render-failure rate, cost per output, time.

An 'Exploratory' tab is visibly separate. The Paper kit generates:
- a methods draft with exact counts;
- a flow diagram (items generated → excluded → judged; raters recruited → excluded);
- a completed Human Evaluation Datasheet (HEDS);
- figure exports (SVG/PNG);
- a data and code bundle;
- the glossary mapping plain names to protocol codes.
- Why: Karpinska et al. found that most open-ended-generation papers left out crucial crowd-task details. HEDS was built to record human evaluations in enough detail for 'comparability, meta-evaluation, and reproducibility'. Separating confirmatory from exploratory results in the UI keeps the operator from p-hacking by accident.
- Src: https://aclanthology.org/2022.humeval-1.6; https://aclanthology.org/2021.emnlp-main.97

### Expert and AI-judge queues reuse the Judge UI [medium]
Expert panels use the same Judge screen through invite links. It adds an optional one-line rationale, reservations so two experts never take the same pair at once, and A/B/E-style hotkeys. AI judges use the same pair schedule and the same image normalization, run as a batch from Lab. Their results appear next to the human results with agreement statistics (human–human vs human–AI). Lay, expert and AI judgments stay in separate, labelled columns and are never pooled by default.
- Why: LangSmith's pairwise annotation queues show the expert pattern: side-by-side runs, a per-item rubric with 'A is better / B is better / Equal', A/B/E hotkeys, and reservations to prevent double judging. Its docs don't mention blinding or side randomization, which this app must add. Using one interface for all judge types removes interface differences as a confound when comparing them.
- Src: https://docs.langchain.com/langsmith/annotation-queues; https://arxiv.org/html/2403.04132v1

## Options
### How operators shape configurations -> Recipes + step toggles, with a read-only wiring diagram and an expert recipe-file escape hatch
- Recipes + step toggles (templates): + Matches how people think ('skip the critique step'); a skip-one test is one toggle; at most 2 disclosure levels; recipes can be versioned and locked | - Experts can't freely rewire in the UI; new topologies need a recipe file
- Node-graph editor (Runway/ComfyUI-style): + Full expressiveness; mirrors the grammar | - This is exactly the 'too esoteric' experience the user wants gone; easy to build invalid or confounded studies; even graph tools add an App Mode to hide the graph
- Chat-built pipelines (agent assembles the workflow): + Lowest barrier to entry | - Not reproducible enough for a paper; hard to lock and audit
### Study setup flow -> Single Study sheet from templates (the YAML stays underneath as the locked artifact)
- Single Study sheet from templates, with a live cost/power sidebar: + Handles steps that depend on each other; cost and power always visible; Paper-1 template makes setup almost one click | - Long page; first-timers need the template, not Blank
- Linear wizard: + Familiar; guided | - NN/g: problematic when steps are interdependent; going back to change variants means re-walking the whole flow
- YAML/code only: + Fastest to build; diffable | - Fails the 'easy to use' requirement
### Lay-rater response format -> Left / Can't decide / Right, with the tie analysis rule written into the locked plan (user to confirm)
- Left / Can't decide / Right: + Lets honest raters say a pair is truly close; Arena precedent; tie can be modelled (Bradley-Terry with ties / Davidson) | - Some raters overuse the tie option; slightly less information per judgment
- Forced choice (Left / Right): + Maximum information per judgment; simpler analysis | - Forces noise on close pairs; identical-pair traps become impossible
- Graded preference (e.g., 5-point much/slightly better): + Captures strength of preference | - More scale-use noise between raters; harder to explain
### Screenshot presentation to raters -> Static side-by-side synced scroll with Flip and a fold phase for Paper 1; live or motion judging as a separate secondary round if RELAY is tested
- Side-by-side synced scroll + Flip toggle + fold first-impression phase: + Covers first impression and full-page judgment; Flip helps with subtle differences; scroll-depth gating confirms both were seen | - More to build; needs a desktop viewport
- Live interactive iframes (WebDev Arena-style): + Most realistic, including motion (RELAY) | - Load-time and failure differences leak condition and add noise; WebDev Arena saw 18% 'both bad'
- Fold-only static images: + Fast, cheap, mobile-friendly | - Misses most of the page; weakens claims about design quality
### Pairing schedule -> Fixed balanced schedule for confirmatory rounds; adaptive only in rounds labelled Exploratory
- Fixed, balanced, pre-registered schedule: + Honest reliability; easy to analyse; reviewers trust it | - Needs more judgments for the same precision
- Adaptive / active sampling (Arena): + About 54% fewer samples for leaderboard precision | - Inflates reported reliability (0.97 vs 0.82); complicates inference
- All-play-all: + Gold-standard completeness | - Cost grows quadratically
### Rater platform integration -> Own Judge app + Prolific external-study link
- Own Judge app + Prolific external-study link (+ expert invite links): + Full control of blinding, logging, keyboard UX and accessibility; one UI for lay, expert and AI judges | - Must be hosted and secured; device checks have to be built
- Qualtrics or Gorilla: + Built-in device restriction and Prolific integration | - Clumsy for image-heavy pairwise trials, synced scroll and hotkeys; logs are harder to join with run data
- Label Studio / LangSmith queues: + Ready-made annotation UX with hotkeys | - No side randomization or blinding guarantees documented; not built for crowd participants
### Vocabulary display -> Plain names, with the 'Show technical names' toggle and an export glossary
- Plain names, with 'Show technical names' toggle and a glossary in exports: + Easy for newcomers; still traceable to the protocol and paper | - Two vocabularies to maintain
- Plain names only: + Simplest | - Breaks traceability to the protocol docs and the methods section
- Protocol codes (SEED, CRITIC…): + No translation layer | - This is the esoteric feel the user wants removed
### Rater device policy -> Desktop-only for Paper 1; any mobile-render judging stays a separate round
- Desktop-only, enforced in the app by viewport check: + Desktop renders shown at a readable scale; consistent conditions | - Smaller pool; must state the requirement in the Prolific description
- Allow mobile: + Bigger and faster pool | - A 1440 px render shrinks to about a quarter on a phone; mobile surveys show more breakoff; device becomes a confound

## Risks
- Simplifying the UI hides confounds. For example, the operator does C1's human steps (pick, Trim, Cliché sweep, Your words) knowing which variant they are working on, so the operator's taste becomes part of the treatment. => 'Your turn' cards hide variant labels and randomize order. Every step has an explicit 'Who does this' (You / Automatic stand-in / Skip) that is locked with the plan. Decision times and actions go into the audit log and are reported.
- Condition identity leaks to raters through file names, image dimensions, compression, load timing, favicons or render failures. => Normalize every render (same width, format and compression; strip metadata; opaque IDs). Preload both items and reveal them together. Judge runs on a separate origin with no access to Lab. A render-validity check runs before judging, and failure rates are reported as a separate outcome.
- Position bias, satisficing, or raters going on autopilot as a session drags on. => Randomize and counterbalance sides; flag per-rater left-pick rate; front-load check pairs; add repeat pairs; keep sessions at 20–25 minutes with a break card; pay at least the recommended rate; set exclusion rules before launch.
- Raters use LLMs or bots, especially on any free-text field. => No free text for crowd raters (use reason chips). Turn on Prolific's bot and LLM authenticity checks where supported. Log paste and tab-switch events and treat them as flags, not automatic exclusions.
- Raters on phones or small laptops see shrunken full-page screenshots. => Enforce viewport and zoom in the app with a polite block page, and state the requirement in the Prolific description. Log the viewport. Mobile renders are judged at 1:1 in a frame or in a separate round.
- Adaptive pairing or pooled judge types produce reliability or effect numbers that reviewers won't trust. => Use a fixed balanced schedule for confirmatory rounds. Keep lay, expert and AI judges in separate columns, never pooled by default. Exploratory work lives in a visibly separate tab.
- Length or formatting differences in prose comparisons drive preferences rather than quality. => Use identical typography and normalized markdown; record length and formatting covariates; pre-register a style-controlled analysis.
- Chasing 'Apple-grade' polish delays the science, and the Lab app grows indefinitely. => Build in order: (1) Judge app + pairing engine + locked study snapshot, which gates Paper 1; (2) Study sheet + runs grid; (3) comparison views; (4) polish passes against the HIG checklist.
- Visual-judgment eligibility excludes some disabled raters, and accessibility gaps add noise. => Meet WCAG 2.2 AA in the interface; state vision eligibility for visual rounds; make prose rounds screen-reader accessible; report eligibility criteria.
- Spend overruns from critic loops (up to 5 rounds), image generation or retries. => Show an itemized cost range before launch, run a pilot first, keep a live spend meter, auto-pause at the cap, and scope API keys with provider-side spend limits.

## Questions
- Ethics approval: do you have, or can you get, an IRB or ethics-board approval or exemption for the rater studies? Most reputable venues (e.g. CHI) and many journals require it, and it affects the consent screen and data retention.
- During Paper 1's experiments, who performs C1's human steps (choosing favorites, Trim, Cliché sweep, Your words)? Options: you, blind to variant; a fixed automatic stand-in; or the Finish stage left out of the comparison. This changes what the paper can claim.
- What is the exact question raters answer? Examples: 'Which page would you rather explore further?', 'Which looks more distinctive?', 'Which looks more professionally designed?'. And should a 'Can't decide' option be allowed, or should choices be forced?
- Which venue or venues are you aiming for first: HCI (CHI/UIST/DIS), NLP (ACL/EMNLP for the prose parts), or ML (NeurIPS Datasets & Benchmarks)? This sets the reporting templates the Paper kit should generate.
- Should Paper 1 judge static screenshots only, or also include a live, interactive or motion round to test the Motion step (RELAY)?
- Is it acceptable to host the Judge app publicly (needed for Prolific) while Lab stays local on your Windows machine? And who on your team needs Lab access, which decides whether login is needed now?
- Should the participant-facing copy say all designs were made with AI? Disclosing it to everyone treats every condition the same; not mentioning it avoids priming. This is an ethics and design call.
