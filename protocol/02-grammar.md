# 02 · The Grammar: how blocks snap together

The eight blocks in [01-blocks.md](01-blocks.md) become a protocol through four things:

- a **chassis** of three stages;
- a small set of **operators** (sequence, parallel, nest, loop, human checkpoint, …);
- typed **ports**, with hard rules about what may flow where;
- a **budget model**.

A **configuration** ([03-configurations.md](03-configurations.md)) is one wiring of blocks on this chassis. Some blocks may sit out.

The operators borrow from established agent-workflow patterns (Anthropic, *Building effective agents*: prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer) and from the Design Council's Double Diamond (diverge, then converge; non-linear). Each operator is grounded in something the article does, **except where marked ⟨A⟩**.

---

## 1. The chassis: Diverge → Deepen → Distill

These are the article's Discover / Define / Deliver stages, renamed so they apply to any domain. The mapping is one-to-one.

| Stage | Article stage | Mode | Job | Blocks | Exit port |
|---|---|---|---|---|---|
| **D1 · Diverge** | Discover | divergent, then a pick | Escape the model's default by bringing variety in from a seed or from human taste. Then land on one or a few promising directions | `SEED`, `VISION` | `option_set<artifact>` or `brief` |
| **D2 · Deepen** | Define | convergent loop + enrichment | Give a promising but still generic direction its own identity under external judgment, then enrich it with what the generalist can't produce natively | `CRITIC`, `ASSET`, `RELAY` | one enriched `artifact` |
| **D3 · Distill** | Deliver | subtractive, human-judged | Remove what adds nothing, swap reflexive defaults, and put a human voice on every reader-facing word. **The human judges.** The AI carries out the human's CUT and TELLS directives. In VOICE the human *writes*, and the AI only inserts and flags | `CUT`, `TELLS`, `VOICE` | shippable `artifact` |

**Entry points.**
- **Full run:** D1 → D2 → D3.
- **D2-entry:** an artifact that already has a direction.
- **D3-entry:** polish only. The article's calorie-app and database-tool copy examples are this case.

**Backtrack.** Return to D1 with a new seed or brief only when a **human** decides a direction has failed. That decision comes at a human checkpoint, or after a critic loop has been recalibrated and still stalls. The article's version is "throw away the results and try something else," said of ambitious ideas that don't land. A critic loop that won't converge is first treated as a **calibration** problem, following the article's T3 tip: set the stopping criteria carefully.

---

## 2. Operators

| Operator | Text | Meaning | Diagram | Grounding |
|---|---|---|---|---|
| **Sequence** | `A > B` | A's output feeds B, with a glue adapter if the port types differ | arrow | Discover > Define > Deliver; image generation as a follow-up prompt |
| **Typed edge** | `A >(port) B` | A sequence with the port type named | labeled arrow | — (notation only) |
| **Relay** | `A ~> B` | B **starts from A's exact end state** (`anchor`) | arrow with seam tick | Suitcase demo: final frame seeds the next clip |
| **Replicate** | `xN[ A ]` | N independent copies in fresh contexts, each with its own seed if seeded → `option_set`. Also a **diagnostic**: if the replicas converge, defaults are winning | stacked cards ×N | Four Claude Code instances, run plain / "random" / seeded |
| **Map** | `each[ A ]` | Apply A to every option with an identical prompt | one swimlane per item | All four seeded designs got the same critic prompt |
| **Lanes** | `{ A \| B }` | Split one artifact by **independent** concerns, run them in parallel, merge. Valid only if the lanes don't touch the same elements | fork/join | ⟨A⟩ e.g. `CUT > TELLS(copy-bearing) > { TELLS(non-copy visual) \| VOICE }` |
| **Parallel audit** ⟨A⟩ | `{{ A ‖ B }}` | Several auditors read the **same** input and return **annotations only**. Nothing is merged or edited | stacked lenses | — (used in C6) |
| **Pick** | `pick(H\|C\|R, k)` | Reduce an `option_set` to k items. **H** = human taste (article). **C** = critic rank ⟨A⟩. **R** = a rule or metric ⟨A⟩. *Pick before you spend* | funnel | `pick(H)`: the article's "visualize your favorites" and "land on a promising initial design." `pick(C)` and `pick(R)` are selection variants (05 #3) |
| **Nest** | `A[ B ]` | B runs inside A's body and returns its result into A | box in box | VISION wraps scatter → react → brief; RELAY wraps ASSET |
| **Isolate** | `@role:tier[family?](ports)` | A fresh-context call that receives only the listed ports and the same prompt each time. Tiers: `big` (judgment), `mid` (execution) | dashed box, filtered inlet | `@critic:big(view)`: "just the screenshot" |
| **Loop-until** | `( A )*[gate]` | Repeat until the gate passes (failure semantics below) | back-edge + gate diamond | Iterate until the critic gives 9/10 |
| **Gate** ⟨A⟩ | `gate[cond]` | A one-shot pass/fail check with no fix step. On fail, follow the `else` edge | diamond | — (C5 pre-launch) |
| **Human** | `?H` · `?H[ A ]` | A pause for human judgment, or a human-judged block | hexagon | React to favorites; CUT; TELLS; VOICE |
| **Route** | `route(c){ a: A \| b: B }` | Choose one branch by condition | decision diamond | Seed vs. vision entry; three image-access routes; chroma key vs. matting |
| **Backtrack** | `<< Dk` | Re-enter stage k with a new seed or brief. **Human-decided** | dashed back-edge | "Throw away the results and try something else" |
| **Retry** ⟨A⟩ | `else ↺ Dk` | Automatic, bounded re-run of stage k with the **same** brief (e.g. once), then `?H` | dotted back-edge | — (C5 gate) |
| **Hidden flag** | `!hidden` | The gate's threshold is withheld from the evaluator | — | "Do not put that criterion in the critic prompt" |
| **Tier call** | `role:tier` | A non-isolated call at a tier (`build:mid`, `fix:mid`) | — | Opus 5 worker |
| **Stage scope** | `Dk::` · `SERIES::` · `OUT::` · `EXTERNAL` | Labels: the stage a line belongs to; an outer series loop; a configuration's output; a dependency outside the blocks | — | notation only |
| **Configuration as block** ⟨A⟩ | `C2 > …` | A configuration's `OUT` port can feed another configuration like a block | — | C2 feeding C1, C3, C5 |
| **Variant suffix** ⟨A⟩ | `VOICE-lite`, `VOICE-early`, `VISION-lite`, `CRITIC-check` | The block run with a reduced knob setting, defined in the configuration that uses it | — | notation only |
| **Optional / sits out** | `A?` · `~~A~~` | `A?` runs only when its trigger fires. `~~A~~` sits out, with a stated reason | dotted · struck through | "When the design is pretty plain" |

### Loop-until: failure semantics, defined once ⟨A⟩

The article gives one rule: try 1–2 iterations, check convergence, and set stopping criteria carefully. Everything else here is a protocol addition, and every configuration uses these semantics.

- **`max` counts total iterations, including the probe.** Default 5.
- **Probe** (article): `probe=n` counts fix iterations after a baseline render, so `probe=1` compares two critic calls. After the probe the loop must be converging: the best score is up at least 1 point (rank gates: our rank improved by at least 1), *or* the critique names new gaps rather than repeating the same ones. If it isn't converging → **recalibrate** the bar, prompt, render, references or worker tier, restart the score trajectory, and allow one more probe.
- **Plateau:** a gain of less than 0.5 over 2 consecutive iterations (rank gates: the same rank for 2 iterations) → stop, and go to **best-snapshot selection**.
- **Best-snapshot selection:** re-rank the top 2–3 snapshots side by side in a **separate fresh judge call**, outside the loop's trajectory, with no scores or critiques attached. Return the winner along with the trajectory. *(A declared default exception to port rule 1: the judge sees several versions, but only at exit.)*
- **Cap reached:** return the best snapshot to `?H`. The human ships it, discards it (`<< D1`), or raises the cap once.
- **`max_backtracks = 1` per candidate.** After that the candidate is dropped.
- **Run budget:** a cap in USD or turns aborts the run to `?H` with the best snapshots so far.

**Glue adapters** ([01](01-blocks.md#glue-connectors-the-article-relies-on-but-never-names)):
- `RENDER`: artifact → view.
- `BRIEF`: direction → executable prompt.
- `TIER`: assigns `big` and `mid` models.
- `KEYS`: scoped credentials.
- `BANK`: archive of failed prompts.
- `dedupe` ⟨A⟩: removes near-duplicate options.

---

## 3. Ports

| Port | What it carries | Produced by → consumed by |
|---|---|---|
| `intent` | The raw, usually bland ask | user → SEED, VISION |
| `seed` | A random string the model must interpret | RNG or the model's own first step → SEED's mapping step only |
| `option_set<T>` | Unordered candidates | SEED, VISION scatter, `xN` → `pick`, `each` |
| `taste` | Human reactions, *including what to avoid* | `?H` → VISION, CUT, TELLS, VOICE |
| `brief` | A concise, executable spec | VISION / `BRIEF` → builders and workers |
| `artifact` | The editable work product | builders ↔ workers |
| `view` | The artifact as the audience experiences it | `RENDER` → CRITIC, `?H` |
| `refs` | Exemplars, used as a moodboard, never a target | human → CRITIC (GREAT mode) |
| `critique` | The biggest gaps, tight and specific | CRITIC → worker |
| `score` | Out of 10, or a rank | CRITIC → whoever holds the threshold |
| `asset` | Generated media (⟨A⟩ or computed figures) | ASSET, RELAY → worker |
| `anchor` | The end state of one segment | RELAY segment k → k+1 |
| `tells` | Catalog of pattern → alternative | catalog → **TELLS sweep only** |
| `voice` | Human-written copy, locked | VOICE → artifact |
| `cred` | A scoped secret | `KEYS` → generator tool calls only |
| `failed` | A prompt that didn't work, with model and date | anywhere → `BANK` |

### Port rules (hard invariants)

1. **Critics see views, never process.** `@critic` accepts only `view` and `refs`: never the code, brief, history or earlier critiques. Exceptions must be declared (the exit re-rank in §2 is the one default exception).
2. **The threshold never enters a critic prompt.** Scores go only to whoever holds the threshold. *Article-faithful:* the worker holds it. ⟨A⟩ An external harness may hold it instead.
3. **Seeds and credentials never enter the artifact.**
4. **Every `option_set` is closed by `pick`** before D3 and before any RELAY chain. `each[ ]` may carry options through D2 only.
5. **Briefs go to builders, never to critics.** The critic must infer intent from the artifact, which tests whether the intent is legible.
6. **Human voice is locked.** No later block writes over `voice`.
7. **The tell catalog never enters a generation, regeneration or critic prompt.** It is used only in the post-generation sweep, where a human compares alternatives. Objective defects (lint or type errors, leftover placeholders, warped logos or hands, garbled text) may be named as hard checks.
8. ⟨A⟩ **No gate or success metric uses an AI-detector score or a "flagged as AI" rate.** Required disclosures, platform AI labels and provenance metadata are always preserved. The protocol targets quality and ownership, never evasion.

---

## 4. Wiring compatibility

| Block | Parallel? | Loops? | Can host | Can be nested in | Must not touch |
|---|---|---|---|---|---|
| `SEED` | native `xN` | outer re-roll only | — | VISION scatter; ASSET/RELAY art direction | any judge; Distill blocks |
| `VISION` | scatter and builds; react/sharpen is serial | react ↔ sharpen `*[H]`; build ↔ discard; BANK retests | SEED | a Distill directive (a mini vision such as "truly minimalist, Apple-native") | the CRITIC's context |
| `CRITIC` | `each` across candidates | is a loop | ⟨A⟩ ASSET as a worker move (RELAY only after a pick, outside `each`) | an outer human loop | the tell catalog; copy wording where copy is a separate layer; vetoing CUT |
| `ASSET` | per variant, per slot | generate → verify ×2–3 ⟨A⟩ | SEED (art direction) | after or inside CRITIC; RELAY stage 1; TELLS swap target | factual evidence |
| `RELAY` | Pattern A per element; Pattern B chain is **sequential** | per-stage retry | ASSET; SEED (art direction) | after a pick | — |
| `CUT` | per unit, one taste owner | ≤2 rounds ⟨A⟩; re-run after additive blocks | VISION (a restraint reference) | TELLS (as a swap action) | the Diverge stage |
| `TELLS` | auditors in parallel; swaps one at a time | sweep → swap → re-sweep once ⟨A⟩ | CUT moves, ASSET swaps | runs after CUT | generation and critic prompts |
| `VOICE` | agent sub-steps only | rewrite → skim → fix | — | a lane after CUT ⟨A⟩ | AI merging of parallel rewrites |

---

## 5. When a block sits out

| Block | Sits out when… |
|---|---|
| `SEED` | the task has one right answer, or the direction is already fixed (brand system, client brief) |
| `VISION` | no human with taste and authority is available, or someone else fixed the brief |
| `CRITIC` | no meaningful render exists; or the artifact is short enough that a human review is cheaper (e.g. under ~300 words); or correctness, not taste, is the bar (that needs VERIFY, see 05 §C) |
| `ASSET` | the medium is pure text with no slot for a non-native asset |
| `RELAY` | nothing in the artifact has state, sequence or motion |
| `CUT` | the task is already compressive (summaries), or it's the Diverge stage |
| `TELLS` | no human will ever read or see the output |
| `VOICE` | there is no reader-facing prose |

---

## 6. Ten default rules

These are defaults. **A configuration may relax a rule only with a declared exception**; see the exceptions table in [03](03-configurations.md#ordering-principle-and-declared-exceptions).

1. **Variety comes from a seed or a human,** never from "be creative." *(article prescription)*
2. **Go broad before deep** *(article)*, **and pick before you spend** ⟨A⟩.
3. **Judgment is separated from production.** Judges run isolated (`@`), see views only, and use a frozen prompt.
4. **The critic's independent score decides when to stop, against a threshold the critic never sees.** ⟨A⟩ Probe, cap, plateau and best-snapshot handling come from §2.
5. **Big model for judgment, capable model for execution.**
6. **Delegate to specialists, and verify in the real render.**
7. **Distill runs after Deepen settles**, in the order CUT → TELLS → VOICE. ⟨A⟩ *(the order is inferred from the article's presentation)*
8. **Audit after, never ban before** *(article)*, and subtract with removal verbs ⟨A⟩.
9. **Humans own the words readers attribute to them.**
10. **Bank what failed**, and retest it when new models ship.

---

## 7. Budget model ⟨A⟩

The article gives one data point: the critic used under 10% of output tokens, and the author estimates that having the big model redesign directly would have cost about 2×. Critic cost is driven mostly by **image input**, so budget by calls and images, not by output share.

```
critic calls   = candidates × iterations(max, incl. probe) [+ 1 re-rank + 1 calibration]
critic images  = critic calls × (renders per call + refs per call)
worker turns   = candidates × iterations
asset calls    = slots × variants × ≤3 tries
relay calls    = segments × candidates_per_segment × retries
human minutes  = VISION react rounds + pick + CUT/TELLS review + VOICE (every line)
```

**Cost controls:**
- Pick early: `pick(H,1)` before D2 removes the multiplier entirely.
- Cache the frozen critic prompt and the reference images as a shared prefix.
- Choose one bar mode per loop; switching mid-loop is a recalibration that restarts the trajectory.
- Run calibration and the probe on one candidate before fanning out to the rest.
- Each configuration in 03 also has a **lite** profile.

---

## 8. Worked notation

```
Polish-entry (the article's calorie-app and database-tool copy cases):
D3:: ?H[ CUT > TELLS > VOICE ]

Seeded fan-out, human pick, one critic loop:
D1:: x4[ SEED > build:mid ] > pick(H,1)
D2:: ( RENDER > @critic:big(view) > fix:mid )*[score≥9 !hidden probe=2 max=5]
```
