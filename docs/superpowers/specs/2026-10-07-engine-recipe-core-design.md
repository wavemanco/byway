# Engine Milestone 0: recipe core

**Status:** design for implementation, 2026-10-07. Implements part of [ADR-0029](../../adr/0029-temporal-runner-versioned-recipe-files.md) (versioned recipe files), [ADR-0041](../../adr/0041-shared-engine-pinned-research-versions.md) (one engine, pinned versions), [ADR-0058](../../adr/0058-design-time-composition-only.md) (composition through a validator) and the "harness spine" items of [ADR-0059](../../adr/0059-engine-requirements-for-composition-and-credibility.md): the content-addressed registry, one canonical recipe format, derivation transforms, the validator with rule IDs and classes, and the conformance suite (Paper 1 subset).

## Goal

A machine-readable protocol and recipe format, so that every configuration and every Study 1 arm is a hashed data file that a validator checks against the grammar's rules, with each violation reported by rule ID. No network, no model calls, no services: pure TypeScript with tests.

## Why first

Both tracks depend on it: studies lock recipe hashes; the product's recommender and composer emit recipes; the runner (Milestone 2) interprets them. Today the port rules are enforced "by following the runbook, not by code" (ADR-0011); this milestone moves them into code.

## Repository layout

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, vitest.config.ts
packages/
  canonical/   RFC 8785 canonical JSON and SHA-256 content hashes
  protocol/    the registry: port types, blocks and glue (with bypass semantics), rule catalogue, exception catalogue
  recipe/      recipe IR (zod), recipe hashing, tree walking, derivation transforms
  validator/   scope-based port typing and rule checks → Verdict
  catalog/     recipe sources for C1, C1-H, the Study 1 baselines and ablations; JSON emitter
  cli/         `byway validate <file>` and `byway hash <file>`
recipes/       generated, committed JSON: <id>.json and manifest.json (id → hash)
```

Toolchain: Node 24, pnpm 11, TypeScript (strict, NodeNext), vitest, zod. No other runtime dependencies.

## Canonical hashing

- `canonicalize(value)`: RFC 8785 (JCS). Object keys sorted by UTF-16 code units, no whitespace, primitives serialized with ECMAScript `JSON.stringify` rules. Rejects `NaN`, `±Infinity`, `undefined`, functions, symbols, `bigint`, cyclic structures, and strings or property names holding a lone surrogate (RFC 8785 §3.2.2.2) with a `CanonicalizationError`.
- `contentHash(value)`: `"sha256:" + hex(SHA-256(UTF-8(canonicalize(value))))`.
- `sha256Hex(text)` hashes the UTF-8 encoding, so it refuses text holding a lone surrogate (it has no UTF-8 encoding) with a `CanonicalizationError` instead of hashing it as U+FFFD.
- A recipe's hash is the content hash of the recipe with its `hash` field removed. The schema version (`schema: "byway.recipe/1"`) is inside the hashed content.
- `parseRecipe` returns only recipes that can be hashed: it asks the hasher, and a recipe holding text with no canonical form is refused with a `ZodError` whose one issue, at the recipe root, names the canonical path ([ADR-0083](../../adr/0083-hashed-text-is-well-formed-unicode.md)).

## Port types

The sixteen ports of 02-grammar §3: `intent`, `seed`, `option_set<T>`, `taste`, `brief`, `artifact`, `view`, `refs`, `critique`, `score`, `asset`, `anchor`, `tells`, `voice`, `cred`, `failed`. In this milestone `option_set` is only ever `option_set<artifact>`.

## Recipe IR

A recipe is a tree. Leaves are **steps**: one executable unit with an actor, the ports it consumes and produces, and optional knobs. Containers are the grammar's operators.

```ts
type Actor = 'model' | 'human' | 'policy' | 'tool';
type Role  = 'build' | 'fix' | 'critic' | 'judge' | 'seed' | 'vision' | 'asset' | 'relay'
           | 'cut' | 'tells-sweep' | 'tells-compare' | 'voice' | 'check' | 'render' | 'select';

interface Step { op: 'step'; id: string; role: Role; block?: BlockCode; glue?: GlueCode;
  actor: Actor; tier?: 'big' | 'mid'; isolated?: boolean; frozenPrompt?: boolean;
  prompt?: string;               // template id, e.g. "article.B1", "project.A6"
  consumes: PortType[]; produces: PortType[];
  writes?: boolean;              // changes the artifact
  proxyFor?: 'human';            // an AI or policy standing in for a human step
  knobs?: Record<string, Json>; variant?: string }
interface Seq       { op: 'seq'; steps: Node[] }
interface Replicate { op: 'replicate'; id: string; n: number; body: Node }   // → option_set<artifact>
interface Each      { op: 'each'; id: string; body: Node }                   // body runs per option
interface Pick      { op: 'pick'; id: string; mode: 'H' | 'C' | 'R'; k: number; actor: Actor; judge?: Step }
interface Loop      { op: 'loop'; id: string; body: Node; gate: Gate }
interface Gate      { metric: 'critic-score' | 'critic-rank' | 'human'; threshold?: number; hidden: boolean;
  holder: 'worker' | 'harness' | 'human'; probe: number; max: number;
  plateau?: { minGain: number; window: number };
  onCap: 'human' | 'policy-best-snapshot'; onNoConverge: 'recalibrate-human' | 'continue' }
interface Route     { op: 'route'; id: string; on: string; branches: { name: string; body: Node }[] }
interface Optional  { op: 'optional'; id: string; trigger: string; body: Node }
interface Stage     { stage: 'D1' | 'D2' | 'D3'; body: Node }
interface Recipe { schema: 'byway.recipe/1'; id: string; title: string;
  kind: 'protocol-config' | 'variant' | 'ablation' | 'baseline' | 'composed' | 'experimental';
  family: string;                // 'C1', 'baseline', … (scopes protocol-declared exceptions)
  channel: 'protocol' | 'research-frozen' | 'product' | 'workspace';
  parent?: { hash: string; derivation: Derivation };
  inputs: PortType[];            // what the run starts with, e.g. ['intent'] or ['intent','voice']
  stages: Stage[]; sitsOut: { block: BlockCode; reason: string }[];
  exceptions: string[];          // exception ids from the catalogue
  bank: boolean;                 // failed prompts go to BANK (default rule 10)
  hash?: string }
```

Operators the grammar defines but this milestone does not need (lanes, parallel audit, relay chains, one-shot gates, retry, backtrack, nest) are added with the C2–C7 recipes in a later milestone; the schema rejects them until then.

## Scope typing

The validator walks the tree carrying two scopes. The **must** scope holds the ports available on every path, each with every producer (role and actor) that may have made it; it decides ST5 and provenance rules (DR1, DR6). The **may** scope holds the ports present on at least one path; it decides "may still be open" rules (PR4, DR2). A recipe starts with `inputs`. A step requires every type in `consumes` to be in the must scope and adds its `produces`. A model step may also list `reads`: ports it takes when they are there, each of which must be in the may scope (some path makes it before the step) and none of which joins the must scope; a port is consumed or read, never both, and the port rules hold a read as they hold a consumed port ([ADR-0089](../../adr/0089-recipe-ir-optional-reads.md)). `replicate` turns the body's `artifact` into `option_set<artifact>` in the outer scope. `each` requires `option_set<artifact>`, runs its body with `artifact` in scope, and leaves `option_set<artifact>`. `pick(k=1)` turns `option_set<artifact>` into `artifact`. A `loop` body is typed once. `route` and `optional` merge their alternatives: must is the intersection (with producers unioned), may is the union.

Order-sensitive rules (PR6 voice lock, DR7 Distill order) walk the control flow instead: routes and optionals fork and join, and loop bodies run twice so effects across the back-edge are seen. (Added after the Milestone 0 review, which showed that must-only typing let a write after an optional VOICE, or an option set left open by one route branch, pass.)

## Rules

Each rule has an ID and a class. **invariant**: never relaxed. **hard**: relaxed only by a catalogued exception. **default**: the ten default rules, relaxed only by a declared exception, and checked only for kinds `protocol-config`, `variant`, `ablation`, `composed` (not for `baseline` or `experimental`). **advisory**: reported as a warning, never a violation.

| ID | Class | Check |
|---|---|---|
| ST1 | invariant | Node ids are unique |
| ST2 | invariant | Every loop has `1 ≤ probe ≤ max` |
| ST3 | invariant | `replicate.n ≥ 1`, `pick.k ≥ 1` |
| ST4 | invariant | Stages appear at most once each, in order D1, D2, D3 |
| ST5 | invariant | Every consumed port is in scope (scope typing) |
| ST6 | invariant | Each sit-out has a non-empty reason; a sat-out block is not used |
| ST7 | invariant | Knobs are registered for the step's block, and values are in the registered range or enum |
| ST8 | invariant | Every cited exception exists, is allowed for the recipe's kind and channel, and is actually needed |
| PR1 | hard | Isolated judge steps (`critic`, `judge`) consume only `view` and `refs` |
| PR2 | hard | Loop gates are hidden and held by the worker or the harness; judge steps never consume `score` |
| PR3 | invariant | Only `seed` steps consume `seed`; only `tool` actors consume `cred` |
| PR4 | hard | No `option_set<artifact>` in scope on entry to D3, and no `each` inside D3 |
| PR5 | hard | Judge steps never consume `brief` |
| PR6 | hard | Once `voice` is in scope, no writing step follows |
| PR7.1 | hard | Only `tells-sweep` steps consume `tells` |
| PR7.2 | hard | `tells-compare` steps are human |
| PR8 | invariant | No gate metric or step knob refers to an AI detector |
| CH3 | hard | `cut` steps are human (Distill is human-judged) |
| LS1 | hard | Critic loops hand non-convergence and the cap to a human (`onNoConverge: recalibrate-human`, `onCap: human`) |
| DR1 | default | A `replicate` body starts from a `seed` step, or a human `taste`/`brief` is in scope |
| DR2 | default | No `option_set<artifact>` in scope on entry to D2 (pick before you spend) |
| DR3 | default | Judge steps are isolated with a frozen prompt |
| DR4 | default | Loops that contain a critic use a critic metric with a hidden threshold |
| DR5 | default | Judge steps use tier `big`; build and fix steps use tier `mid` |
| DR6 | default | A critic's `view` comes from a `render` step |
| DR7 | default | CUT, TELLS and VOICE appear only in D3, in that order, and no judge or check step follows them |
| DR8 | default | Build and fix steps carry no ban list (`avoid` knob) |
| DR9 | default | Reader-facing words come from a human VOICE step |
| DR10 | advisory | `bank` is true |

## Exceptions

Exceptions are **clause-scoped**: each finding names the clause of the rule it breaches, and an exception that lists clauses for a rule suppresses only those. (Added during implementation: without it, C1-DR7, which exists to allow the defect check after Distill, also hid a reordered CUT/TELLS/VOICE.)

| ID | Relaxes (clauses) | Scope | Allowed for |
|---|---|---|---|
| C1-DR2 | DR2 | protocol-declared (03, ordering principle) | the C1 family |
| C1-DR7 | DR7 (check-after: a score-free `check` step only) | protocol-declared (CRITIC-check after D3) | the C1 family |
| SM-1 | PR4 (d3-entry, each-in-d3) | study manipulation | channel `research-frozen` |
| SM-2 | LS1 | study manipulation | channel `research-frozen` |
| SM-3 | CH3 | study manipulation | channel `research-frozen` |
| SM-4 | PR7.2 | study manipulation | channel `research-frozen` |
| SM-5 | PR1 (not-isolated), PR2 (shared-context), DR3 (not-isolated), DR4 (shared-context), DR5 (judge-tier) | study manipulation | channel `research-frozen`, kind `ablation`, the `critique-self` derivation only |
| SM-6 | PR6 (fixed-input), DR9 (fixed-input) | study manipulation | channel `research-frozen` |

All study manipulations are limited to the Study 1 families (`C1`, `baseline`) until lock binding exists. An exception cited twice, an unknown id (including inherited names such as `toString`) and a leave-one-out derivation claimed by anything other than an `ablation` are all ST8 violations.

The Study 1 protocol's SM-5 row lists only port rules 1 and 2; the manipulation also necessarily breaches DR3, DR4 and DR5, so protocol v1.2 must list them (see the [backlog](../../backlog.md)).

Recipes carry a `family` field (for example `C1`, or `baseline`) so that protocol-declared exceptions can be limited to the configuration that declared them.

## Derivations

- `leaveOneOut(recipe, target)` with target `SEED`, `CRITIC`, `ASSET` or `D3` applies the target's registered bypass and returns a recipe with `kind: 'ablation'`, the same channel, and `parent = { hash, derivation: { transform: 'leave-one-out', version: 1, target } }`. Bypasses: SEED → the seed step becomes a plain build from `intent` and DR1 is suspended; CRITIC → each critic loop is replaced by nothing (the build output passes through); ASSET → the asset step is removed; D3 → the D3 stage is removed. Exceptions that no longer apply are dropped.
- `critiqueSelf(recipe)` applies the CRITIC-self manipulation: the isolated big-tier critic becomes a non-isolated mid-tier self-critique in the worker's context, the gate holder stays the worker, and SM-5 is added.
- Suspended rules are recorded in the verdict, never silently skipped.

## Verdict

```ts
interface Violation { ruleId: string; class: RuleClass; path: string; message: string }
interface Verdict { ok: boolean; recipeHash: string; violations: Violation[]; warnings: Violation[];
  exceptionsUsed: string[]; suspended: string[] }
```

`ok` is true iff `violations` is empty. A violation of a hard or default rule is suppressed only by a cited, allowed exception that relaxes that rule; the exception is then listed in `exceptionsUsed`.

## Recipes in this milestone

- **C1** (protocol-config): seed entry route only in this milestone, `x4[SEED build] > each[critic loop > optional ASSET "plain?" > render] > pick(H,1) > D3 human CUT > TELLS sweep + human compare > VOICE > CRITIC-check`; exceptions C1-DR2, C1-DR7. VISION, the C2 entry and RELAY arrive with a later milestone.
- **C1-H** (variant, research-frozen): parent C1; no picks; the critic sees one desktop render and runs the worker-written prompt (`study1.A.CRIT-C`); ASSET always on, with the article's prompt and no slot policy; D3-auto with an AI CUT reviewer (A.9), a fresh-context TELLS sweeper (A.11) and an AI keep-or-revert call (A.13); no CRITIC-check (it sits out in Study 1); fixed copy deck as input `voice`; loop handled by policy; exceptions C1-DR2, SM-1, SM-2, SM-3, SM-4, SM-6.
- **B-BoN**: per slot, N plain builds and one A.14 selector call that picks one; N is a planning value until Stage 1 fixes it from pilot costs.
- **Ablations of C1-H**: −SEED, −CRITIC, −ASSET, −D3 (derived), **CRITIC-self** (derived).
- **Baselines** (research-frozen): B-Plain (`article.B1`), B-Random (`article.B2`), B-Skill (B-Plain with the frontend-design skill), B-BoN (plain builds ×N, rendered, picked to 4 by the same isolated critic). All take the fixed deck and cite SM-6.

## Tests

- Canonical JSON: RFC 8785 vectors for key ordering (including non-ASCII keys), number formatting and rejection of non-JSON values, including lone surrogates in values and property names.
- Hashing: stable across key order; any field change changes the hash.
- Each rule has at least one broken fixture that produces exactly that rule ID.
- Every catalog recipe validates with no violations, and its `exceptionsUsed` equals its cited exceptions.
- Removing any cited exception from a catalog recipe produces the violation that exception relaxes.
- Study manipulations cited on the `protocol` channel fail ST8.
- The committed JSON in `recipes/` equals the catalog's output (no drift).
- CLI: valid file → exit 0; violations or a stored hash that does not match the content → exit 1; unreadable or malformed file → exit 2 with a clear message. Files are read as UTF-8 (a BOM is accepted; UTF-16 is rejected), repeated keys and nesting deeper than 64 levels are rejected, and reserved key names (`__proto__`, `constructor`, `prototype`) are rejected anywhere in a recipe.

## Out of scope (later milestones)

Prompt templates and their hashes; model profiles and checkpoint-binding maps as separate artifacts; runtime taint tracking; the gateway, runner, sandboxes and renderer; C2–C7 and C6a recipes and the remaining operators.
