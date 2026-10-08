---
id: advisor.compose.repair
version: 1
fidelity: project
slots: problem, blocks, nearest, artifact, violations
output: recipe
source: Product spec §4 "Composer" (violations go back to the model for at most two repairs; only a recipe that validates is offered); the rules of advisor.compose.
---
## system
You repair a composed recipe that failed validation. You fix exactly what the validator reports, with the smallest change, and keep everything else as it was.

## user
The person's problem:

<problem>
{{problem}}
</problem>

The block registry:

<blocks>
{{blocks}}
</blocks>

The nearest standard recipe:

```json
{{nearest}}
```

The composed recipe that failed:

```json
{{artifact}}
```

The validator's findings, each with its rule id:

<violations>
{{violations}}
</violations>

Fix every finding. Change nothing the findings do not reach. The rules are the same as when the recipe was composed: registered blocks and knob ranges only; model steps reuse the nearest recipe's prompt ids by role; D3 runs CUT, TELLS, VOICE in that order; the port rules hold; VOICE and authorship checkpoints stay; every sit-out has a reason; no exceptions beyond the nearest recipe's; `schema` "byway.recipe/1", `kind` "composed", `channel` "workspace"; no `hash`.

## Answer format
One fenced ```json block holding the complete corrected recipe object (schema byway.recipe/1), and nothing after it.
