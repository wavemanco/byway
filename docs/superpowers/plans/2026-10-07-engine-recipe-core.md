# Engine Milestone 0 (recipe core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every C1-family configuration and Study 1 arm a hashed recipe file that a validator checks against the grammar, reporting violations by rule ID.

**Architecture:** A pnpm TypeScript monorepo with five small packages (canonical → protocol → recipe → validator → catalog) plus a CLI. Recipes are trees of typed steps inside operator containers; the validator types port scopes and applies a rule catalogue with classes and a catalogue of exceptions.

**Tech Stack:** Node 24, pnpm 11, TypeScript 5 (strict, NodeNext), vitest, zod.

**Spec:** [docs/superpowers/specs/2026-10-07-engine-recipe-core-design.md](../specs/2026-10-07-engine-recipe-core-design.md)

**Execution note:** the user asked to start coding immediately ([ADR-0062](../../adr/0062-code-first-work-mode.md)), so this plan is executed natively in the same session; the code lives in the task commits rather than being duplicated here.

## Global Constraints

- Node ≥ 24, pnpm ≥ 11, TypeScript `strict: true`, ESM (`"type": "module"`), `moduleResolution: NodeNext`.
- Runtime dependencies: `zod` only. Dev: `typescript`, `vitest`, `tsx`, `@types/node`.
- Recipe schema id: `byway.recipe/1`. Hash format: `sha256:<64 lowercase hex>`.
- Rule IDs and exception IDs exactly as in the spec tables.
- No network access, no model calls, no secrets.
- Line endings LF (`.gitattributes` already enforces).

## Review Focus

1. **Malformed recipe files** (bad JSON, unknown `op`, unknown block, missing fields): the CLI must exit 2 with the zod path in the message, never a stack trace. Pinned in Task 6.
2. **Non-ASCII and unusual keys** in hashed content (accented letters, emoji, keys that sort differently by code point vs UTF-16): hashes must follow RFC 8785. Pinned in Task 1.
3. **An exception cited "just in case"**: an unused exception must fail ST8, so exceptions cannot be stockpiled. Pinned in Task 4.
4. **Hand-edited ablations**: an ablation whose parent hash does not match a catalog recipe must be detectable; the catalog drift test compares regenerated JSON with the committed files. Pinned in Task 5.
5. **Study manipulations leaking into protocol recipes**: SM-* cited on a `protocol` or `product` channel recipe fails ST8. Pinned in Task 4.

---

### Task 1: Monorepo scaffold and canonical hashing

**Files:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore` (add `node_modules/`, `dist/`), `packages/canonical/{package.json,tsconfig.json,src/index.ts,test/canonical.test.ts}`

**Interfaces — Produces:** `canonicalize(value: unknown): string`, `sha256Hex(text: string): string`, `contentHash(value: unknown): string`, `class CanonicalizationError extends Error`.

- [ ] Write tests: key ordering by UTF-16 code units (`{"€":1,"\r":2,"דּ":3,"1":4,"\u0080":5,"😀":6}` sorts as `"\r","1","\u0080","€","😀","דּ"`); nested arrays keep order; numbers `1e21`, `1e-7`, `-0` → `1e+21`, `1e-7`, `0`; strings escape per `JSON.stringify`; `NaN`, `Infinity`, `undefined` values, functions, `bigint` and cycles throw `CanonicalizationError`; `contentHash` equal for `{a:1,b:2}` and `{b:2,a:1}` and different for `{a:1,b:3}`; hash matches `^sha256:[0-9a-f]{64}$`.
- [ ] Run, see failures. Implement. Run, see passes. Commit `feat(canonical): RFC 8785 canonical JSON and content hashes`.

### Task 2: Protocol registry

**Files:** `packages/protocol/{package.json,tsconfig.json,src/ports.ts,src/blocks.ts,src/rules.ts,src/exceptions.ts,src/index.ts,test/protocol.test.ts}`

**Interfaces — Produces:** `PORT_TYPES`, `type PortType`; `BLOCK_CODES`, `type BlockCode`, `BLOCKS: Record<BlockCode, BlockDef>` with `knobs: Record<string, KnobDef>` and `bypass: { transform: string; suspends: RuleId[] }`; `GLUE_CODES`, `type GlueCode`; `RULES: Record<RuleId, RuleDef>` with `class: 'invariant'|'hard'|'default'|'advisory'`; `EXCEPTIONS: Record<string, ExceptionDef>` with `relaxes: RuleId[]`, `scope: 'protocol-declared'|'study-manipulation'`, `channels`, `families`.

- [ ] Tests: 16 port types; 8 blocks and 6 glue codes; every rule in the spec table exists with the stated class; invariants are never in any exception's `relaxes`; every exception relaxes only hard or default rules; SM-* are allowed only on `research-frozen`.
- [ ] Implement, pass, commit `feat(protocol): machine-readable registry of ports, blocks, rules and exceptions`.

### Task 3: Recipe IR, hashing and walking

**Files:** `packages/recipe/{package.json,tsconfig.json,src/schema.ts,src/hash.ts,src/walk.ts,src/index.ts,test/recipe.test.ts}`

**Interfaces — Consumes:** Task 1, Task 2. **Produces:** zod `RecipeSchema`, `NodeSchema`, types `Recipe`, `Node`, `Step`, `Gate`, `Stage`; `parseRecipe(json: unknown): Recipe` (throws `ZodError`); `recipeHash(r: Recipe): string`; `withHash(r: Recipe): Recipe`; `walk(r: Recipe, visit: (node, path, stage) => void)`.

- [ ] Tests: a minimal valid recipe parses; unknown `op`, unknown block code, unknown port type and missing `stage` are rejected with a path; `recipeHash` ignores the `hash` field and changes when any step changes; `walk` visits every node with paths like `stages[1].body.steps[0]`.
- [ ] Implement, pass, commit `feat(recipe): recipe IR, hashing and tree walking`.

### Task 4: Validator

**Files:** `packages/validator/{package.json,tsconfig.json,src/scope.ts,src/context.ts,src/checks/structural.ts,src/checks/ports.ts,src/checks/defaults.ts,src/index.ts,test/fixtures.ts,test/validator.test.ts}`

**Interfaces — Consumes:** Tasks 1–3. **Produces:** `validate(r: Recipe, opts?: { suspended?: RuleId[] }): Verdict` with `Verdict = { ok, recipeHash, violations, warnings, exceptionsUsed, suspended }`.

- [ ] Tests (one broken fixture per rule, built by mutating a small valid fixture): ST1 duplicate id; ST2 `probe > max`; ST3 `n = 0`; ST4 D2 before D1; ST5 critic consumes `view` with no render; ST6 empty reason and sat-out block used; ST7 unknown knob and out-of-range value; ST8 unknown, disallowed-channel and unused exception; PR1 critic consumes `artifact`; PR2 `hidden: false`; PR3 build consumes `seed`; PR4 option set into D3; PR5 critic consumes `brief`; PR6 writing step after `voice`; PR7.1 build consumes `tells`; PR7.2 model `tells-compare`; PR8 gate metric `ai-detector`; CH3 model `cut`; LS1 `onCap: policy-best-snapshot`; DR1–DR9 one each; DR10 produces a warning, not a violation; default rules skipped for `kind: 'baseline'`; a cited allowed exception moves a violation into `exceptionsUsed`; invariants cannot be excepted.
- [ ] Implement, pass, commit `feat(validator): scope typing and rule checks with rule IDs`.

### Task 5: Catalog recipes, derivations and conformance

**Files:** `packages/recipe/src/derive.ts`, `packages/recipe/test/derive.test.ts`, `packages/catalog/{package.json,tsconfig.json,src/steps.ts,src/c1.ts,src/c1h.ts,src/baselines.ts,src/index.ts,src/emit.ts,test/conformance.test.ts}`, `recipes/*.json`, `recipes/manifest.json`

**Interfaces — Produces:** `leaveOneOut(r, target: 'SEED'|'CRITIC'|'ASSET'|'D3'): Recipe`; `critiqueSelf(r): Recipe`; `CATALOG: Recipe[]` (hashed) with ids `c1`, `c1h`, `c1h-no-seed`, `c1h-no-critic`, `c1h-no-asset`, `c1h-no-d3`, `c1h-critic-self`, `b-plain`, `b-random`, `b-skill`, `b-bon`; `emitCatalog(dir): void`.

- [ ] Tests: every catalog recipe validates `ok` with `exceptionsUsed` equal to its cited exceptions; removing each cited exception yields the violation it relaxes; derived recipes have `kind: 'ablation'`, the parent's hash and channel, and the right structure (no loop for −CRITIC, no D3 for −D3, no seed step for −SEED, a non-isolated mid critic for CRITIC-self); `recipes/*.json` equals `emitCatalog` output and `manifest.json` lists every id with its hash.
- [ ] Implement, emit, pass, commit `feat(catalog): C1, C1-H, Study 1 baselines and ablations as validated recipes`.

### Task 6: CLI

**Files:** `packages/cli/{package.json,tsconfig.json,src/main.ts,test/cli.test.ts}`; root script `byway`.

**Interfaces — Produces:** `run(argv: string[], io): Promise<number>`; commands `validate <file>` (exit 0 ok, 1 violations, 2 unreadable/malformed) and `hash <file>`.

- [ ] Tests: valid catalog file → 0 and prints the hash; a fixture with violations → 1 and lists rule IDs; malformed JSON → 2 with "not valid JSON"; schema error → 2 with the zod path; missing file → 2.
- [ ] Implement, pass, commit `feat(cli): validate and hash recipe files`.
