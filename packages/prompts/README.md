# @byway/prompts

The prompt templates behind every model call in the byway product, and the strict renderer that implements `PromptRenderer` from `@byway/contracts` (product spec §3.3, work package WP-P).

These prompts are the product's quality. They carry the article's techniques as the protocol generalizes them (`protocol/01-blocks.md`, `03-configurations.md`, `06-runbook.md`): the seed is interpreted for direction and never revealed; the direction is ambitious and specific; the critic sees views only, infers the intended aesthetic, pictures a top studio's execution and names the biggest gaps; generated imagery adds personality; subtraction uses removal verbs; the cliché sweep runs after generation, with the catalog kept out of every generation and critic prompt; and the person's own words are applied verbatim.

## Use

```ts
import { createPromptRenderer, greatLineup, labelled, problemSlot } from '@byway/prompts';

const prompts = createPromptRenderer(); // loads and checks every template in templates/
const p = prompts.render('product.c4.draft', { medium: 'prose', problem: problemSlot(brief), brief: direction });
// p = { id, version, hash: 'sha256:…', fidelity, system?, user } — record id, version and hash with the call.
```

- `render` throws a `PromptTemplateError` with a `code`: `unknown-template`, `no-variant` (an id that only has medium variants, none for this medium), `missing-slot` (with `.slot`), or `bad-template` (at load time).
- `prompts.ids()`, `prompts.variants(id)` and `prompts.info(id, medium?)` describe the library. `PROMPT_IDS` is the same list as a literal.
- Code that must not touch Node built-ins (Temporal workflow bundles) imports `@byway/prompts/pure`: the ids, the output contracts and the slot helpers, without the renderer.

## Prompt ids

| Ids | What they are |
|---|---|
| `article.*`, `runbook.*` | C1's step prompts: the article's prompts and the 06-runbook templates, paraphrased |
| `product.<config>.<step-id>` | The step prompts of C2–C7 and C6a, written by the project |
| `helper.asset.briefs`, `helper.asset.integrate`, `helper.voice.apply`, `helper.rerank` | Runner helpers, rendered for the purposes `asset.briefs:<m>`, `asset.integrate:<m>`, `voice.apply:<m>`, `rerank:<m>` (`HELPER_PROMPTS`) |
| `advisor.intake`, `advisor.compose`, `advisor.compose.repair` | Advisor calls; the purpose is the id |
| `tells.<medium>`, `tells.<domain>` | Tell catalogs: not prompts, but the text the runner puts in a TELLS sweep's `tells` slot |

A TELLS sweep step names its catalogs in `knobs.domains` (C3 sweeps four prose catalogs, C6a only fiction). `tellsPromptIds(medium, domains)` returns the ids to render; join their `user` texts into the `tells` slot. Without domains it is the medium's default catalog.

An ASSET step's own prompt (`article.ASSET`, `product.c3.asset`, `product.c2.mood-boards`, `product.c5.anchor-frames`) is the image-brief call (purpose `asset.briefs:<medium>`): it carries the step's art direction. `helper.asset.briefs` is the generic equivalent for an ASSET step without one; `helper.asset.integrate` places the generated images afterwards.

## Template files

One file per prompt id in `templates/`, named `<id>.md`. A medium's variant is `<id>@<medium>.md`; the renderer uses it when the `medium` slot matches, and the base file otherwise.

```markdown
---
id: product.c4.draft
version: 1
fidelity: project
slots: problem, brief
output: artifact:prose
source: where the wording comes from (protocol section, ADR, spec)
---
## system
Optional: the role and the stance.

## user
The task, with slots, and last of all:

## Answer format
The exact output contract.
```

- **Front matter** is checked strictly: `id` matches the file name; `version` is a positive integer; `fidelity` is `verbatim`, `paraphrase` or `project`; `slots` lists exactly the slots the body uses (no more, no fewer); `output` names a contract from `OUTPUT_CONTRACTS` (spec §3.3); `source` says where the wording comes from.
- **Slots** are `{{name}}`, with names from `PROMPT_SLOTS`. **Blocks** are `{{#if name}}…{{else}}…{{/if}}`, taken when the slot has a non-blank value; they nest, and a tag alone on its line leaves no blank line. There is nothing else: no loops, helpers or escapes.
- **Rendering is strict.** A slot inserted on the path taken must be provided (an empty string counts); a slot used only inside an `#if` branch that is not taken is optional. Slot values are inserted as they are and never re-read, so a user's `{{seed}}` stays text.
- **The hash** is `sha256:<hex>` of the file with line endings normalized to LF. It changes with any byte of the file, front matter included.

## Slot conventions

The runner and the advisor fill slots from ports (spec §3.2 "Prompt slots by port"). The helpers in `src/slots.ts` produce the layouts below; the gateway's mock reads the same layouts.

| Slot | Holds | Helper |
|---|---|---|
| `problem` | The user's problem and brief fields, pasted material fenced. Templates wrap it in `<problem>…</problem>` | `problemSlot(brief)` |
| `brief`, `critique`, `taste`, `voice` | The port's text. In relay steps `brief` says "Shot N" | |
| `artifact` | The artifact's raw text. Templates fence it in the medium's language (`ARTIFACT_FENCE`): html, markdown, json, diff | |
| `view` | A text view (prose, options, media storyboards, diffs). Screenshot views are attached images and leave the slot empty | |
| `options` | Candidates under `### A`, `### B`… headings; in overlap steps the unseeded runs under `### V1`–`### V3` (the seeded options are then in `view`); on an ASSET step on options, the option labels | `labelled(texts)`, `vanillaLabelled(texts)` |
| `refs`, `labels` | GREAT-mode critics: `refs` is the number of references, `labels` describes the lineup and names ours ("5 items, labelled A–E; ours is C"). Leave `refs` empty for OK mode | `greatLineup(referenceCount, oursIndex)` |
| `seed` | The runner's random string, for SEED steps only | |
| `tells` | The rendered tell catalogs | `tellsPromptIds(medium, domains)` |
| `images` | Generated images by artifact route: `![alt](/api/artifacts/<id>)` lines (prose) or `/api/artifacts/<id> \| alt \| slot` lines (web-page) | `imagesSlot(medium, images)` |
| `questions` | The chooser questions as a JSON array of `{id, routesTo, text}` | |
| `blocks`, `nearest`, `violations` | The block registry, the nearest recipe as JSON, the validator's findings | |
| `medium` | The recipe's medium; selects variants | |

## Rules every template keeps

The tests in `test/` enforce these on every file:

- **Port rule 1:** judging templates (critic, judge, check, cut, tells sweep, overlap, re-rank) never take `artifact`; critics take only `view`, `refs` and `labels`.
- **Port rule 2:** no critic, judge, check or re-rank template holds a threshold or a score target. The answer format `Score: N/10` is allowed; "9/10" as a goal is not.
- **Port rule 3:** only SEED templates take `seed`, once, with an instruction never to reveal it.
- **Port rule 7:** only TELLS sweep templates take `tells`, and no other template contains catalog text.
- **Port rule 8 and claims:** no mention of AI detectors or evasion, and no efficacy claims ("research-backed", "proven", "studies show", "outperforms").
- **Critic modes** (ADR-0071): every critic branches on `refs`. GREAT mode contains the word GREAT, the line "There are R references and 1 of ours (…)", ranks by polish and taste and answers `Rank: N of M`; OK mode is the article's critic and answers `Score: N/10`.
- **Answer format last:** every template that expects an answer ends with a `## Answer format` section that states its spec §3.3 contract; every slot comes before it, and it mentions a code fence at most once, so it never opens a block a parser could take for the work.
- Every recipe step's template answers its step's role in the recipe's medium (`outputForStep`), and uses only slots its ports fill.

## Adding or changing a template

1. Write or edit the file in `templates/`. Base the wording on the protocol (01 for each block's procedure and guards, 03 for the configuration, 06 for C1, C3, C4 and C6a) and cite it in `source`.
2. Keep the article's techniques intact, and never ban the tell catalog's patterns in a generation prompt: the sweep finds them afterwards.
3. Bump `version` on any change to the wording of the system or user section. The hash records every change anyway; the version is how people and the ledger tell prompt generations apart.
4. A new id also goes into `PROMPT_IDS` (`src/ids.ts`). A new recipe step's prompt id comes from `@byway/catalog`, and the coverage test fails until it has a template.
5. Run `pnpm vitest run packages/prompts`.

## Fidelity

| Level | Meaning | Used for |
|---|---|---|
| `verbatim` | The article's own words | Nothing: the article is copyrighted, so no template reproduces more than a few of its words |
| `paraphrase` | The article's prompt or table restated in the project's words | `article.*`; the runbook templates that restate the article's prompts (`runbook.critic-ok`, `runbook.cut-apply`, `runbook.tells-swap`); `tells.ui` and `tells.web-page` (the article's table) |
| `project` | Written by the project: protocol additions (⟨A⟩) and the product's own prompts | `product.*`, `helper.*`, `advisor.*`, the other runbook templates and catalogs |
