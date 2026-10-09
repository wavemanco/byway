# ADR-0089: Recipe IR: model steps may read a port when an optional branch made it

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-09 02:00 |
| **Track** | System |

## Context

The external review's F09 ("C7 collects clarification that its implementer does not consume") was accepted in part by the verification, at P2. C7 runs an optional spec interview in D1: a model asks numbered questions with defaults (`interview`, producing `brief`), and the person answers (`spec`, consuming and producing `brief`). Its `implement` step consumed only `intent`. `buildPrompt` fills slots only for consumed ports, so the `{{#if brief}}` section of `product.c7.implement` never rendered. The person paid for the interview, wrote a spec, and the implementer never saw it. Nothing on screen said so.

The verification placed the cause in the IR, not the catalog. A step's inputs could only be required (`consumes`, which scope typing holds to `must`: in scope on every path) or absent. A port that only an optional branch makes is in `may` but not in `must`, so wiring `brief` into `consumes` failed ST5. The repo already knew: `docs/backlog.md` "Product follow-ups" row 1 proposed an optional-read field, and `coverage.test.ts` carried an exemption for `product.c7.implement`.

The verification also showed the review's claim that "requiring a port an optional may never produce would introduce another bug" was wrong: the validator refuses it statically, and at run time an absent port already fills its slot with an empty string.

## Decision

1. **`Step.reads`.** A step may list ports it reads when they are there (`reads?: PortType[]`). It is an additive field of `byway.recipe/1`, with no schema version bump. `inputsOf(step)` is `consumes` followed by `reads`. `FIELD_ROLES` classifies it as a semantic set (ADR-0092).
2. **Scope typing (ST5).**
   - Each read port must be in `may` at the step: some path makes it before the step. Otherwise: `step "X" reads P, which no path makes before it` (clause `reads-unmade`).
   - A read never adds to `must`. A later step that consumes the port is still refused when only an optional branch makes it.
   - A port is consumed or read, never both (clause `reads-twice`).
   - Only a model step reads optionally (clause `reads-actor`): its prompt fills an absent port's slot with nothing, and no other step has a slot to leave empty.
3. **Port rules read `inputsOf`.** PR1 (a judge takes only `view` and `refs`), PR2 (judges never see a score), PR3 (seed and credentials), PR5 (briefs never to judges) and PR7.1 (the tell catalog only to the sweep) hold a read exactly as they hold a consumed port.
4. **Runner and prompts.** `toStepSpec` carries `reads`. `buildPrompt` fills a read port's slot as it fills a consumed one: the port's value, or `''` when no step made it, so a template's `{{#if}}` section leaves it out. `slotsForStep` (the composed profile's render check) and the template coverage test count reads too. The `product.c7.implement` exemption is removed.
5. **C7.** `implement` reads `brief`. The blind passes after it (defect fix, scope cut, review, bloat cut, swaps) never see it (C7-DR7); the spec reaches the scope cut only through the implementer's "Why:" (ADR-0090). c7's hash changes, from `sha256:3b54f11b518ec500ec15342219ff2428e940f2e2d6d92f592df6336d7ba0f96d` to `sha256:cefc7ab596d50dbc755049b9fed50096fa97b540150b849a9b590813196d3f52`. No other recipe hash changes: `recipeHash` drops undefined fields, so a recipe without `reads` hashes as before.
6. **Research-frozen recipes do not use `reads`.** A catalog test holds every `research-frozen` recipe (C1-H and its ablations) to that.
7. **The composer.** `advisor.compose` v2 says what `reads` is for, and the block registry's port signatures show a read as such.

### A documented limit: loops and relays are typed on their first round

Scope typing types a loop body or relay link once from its entry state (later rounds only look for option sets set aside, ADR-0092). A read of a port first made later in the same body is therefore refused, though on a second round it would be there. No canonical recipe needs it, and threading back-edge state through every rule would be speculative. A test pins the refusal.

### Another instance, deferred

C6's `angles`/`react` and the author's write is the same shape: the person's reaction is taste the author's draft could read. Its consumer is a person's step, which has no slot to leave empty, so `reads` stays limited to model steps until a person-step read has a defined meaning.

## Alternatives considered

- **A pass-through brief on the skip path** (the review's repair), so `brief` is in `must`: it needs a new executor or a paid model step, routes around the IR gap instead of closing it, and still loses the interview's questions (ADR-0090).
- **Consume `brief` and except ST5 for C7**: an exception for a typing gap, which every future optional input would need again.
- **A generic declarative step-contract framework** (option D): speculative; this one field is the only declaration the evidence calls for.

## Consequences

- C7 implements from the spec when the interview ran, and from the request alone when it did not.
- An older strict `StepSchema` refuses the regenerated `recipes/c7.json`. That is acceptable for a local, single-version app.
- The engine spec's "Scope typing" and the product spec's "Prompt slots by port" say how reads are typed and filled.
- Closes `docs/backlog.md` "Product follow-ups" row 1.

## Evidence

- `docs/reviews/2026-10-08-external-review-verification.md` (F09; cluster F, option C, part A) and the review folder `C:\Users\arvik\code\byway_review\` (`byway-review.md`).
- Tests: `packages/recipe/test/reads.test.ts`, `packages/validator/test/reads.test.ts`, `packages/runner/test/reads.test.ts`, `packages/prompts/test/coverage.test.ts`, `packages/prompts/test/step-slots.test.ts`, `packages/catalog/test/configurations.test.ts` (C7), `packages/catalog/test/conformance.test.ts` (research-frozen), and the C7 e2e in `packages/runner/test/e2e/text-media.ts`.
