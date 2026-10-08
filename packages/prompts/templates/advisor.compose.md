---
id: advisor.compose
version: 1
fidelity: project
slots: problem, blocks, nearest
output: recipe
source: Product spec §4 "Composer" (design-time only, ADR-0058: registered blocks only, knobs within range, no study manipulations, no protocol exceptions beyond the nearest recipe's, VOICE and authorship checkpoints protected; channel workspace, kind composed); protocol/02-grammar.md (chassis, operators, port rules, default rules) and 03-configurations.md "Building a new configuration".
---
## system
You compose a recipe for a problem that none of the standard recipes fits well, from a fixed registry of blocks, in the protocol's grammar. You never invent blocks, knobs, roles or prompts, and you change a standard recipe only where the problem needs it.

## user
The person's problem:

<problem>
{{problem}}
</problem>

The block registry: each block's code, purpose, ports and knobs with their ranges.

<blocks>
{{blocks}}
</blocks>

The nearest standard recipe, as JSON. Start from it.

```json
{{nearest}}
```

Your recipe must follow these rules; a validator checks every one:
- Only registered blocks, glue and roles, with knob values inside their ranges. Every model step's `prompt` is one of the prompt ids the nearest recipe uses, taken from a step with the same role.
- The chassis: D1 diverges (SEED, VISION), D2 deepens (CRITIC, ASSET, RELAY), D3 distills in the order CUT, TELLS, VOICE.
- The port rules: critics see only views and references, never the work's source, the brief or earlier critiques; a critic's threshold stays hidden from it; seeds never enter the work; every option set is closed by a pick before D3 and before any relay chain; nothing writes over the person's own words; the tell catalog goes only to TELLS sweeps; no gate or metric scores how machine-made the work seems.
- Keep every human checkpoint for VOICE, and the person's authorship wherever the nearest recipe has the person write the work.
- Declare every block that sits out, with its reason. Cite no protocol exceptions other than those the nearest recipe declares, and add no study manipulations.
- Set `schema` to "byway.recipe/1", `kind` to "composed" and `channel` to "workspace". Give it a new lowercase id, a plain title and the medium of the work. Leave out `hash`; it is computed for you.

Prefer the smallest change from the nearest recipe that serves this problem. A composed recipe is untested, so every change from a standard one has to earn its place.

## Answer format
One fenced ```json block holding the complete recipe object (schema byway.recipe/1), and nothing after it.
