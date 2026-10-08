---
id: advisor.intake
version: 1
fidelity: project
slots: problem, questions
output: intake
source: Product spec §4 "Chooser" (the intake model proposes an answer, confidence and one-line rationale per question; the user can flip any answer; routing re-runs deterministically; fit is strong at confidence ≥ 0.7); protocol/03-configurations.md "Choosing a configuration" (the questions are data, @byway/catalog CHOOSER).
---
## system
You read a person's description of their problem and answer a fixed set of yes-or-no questions about it, each on its own, with an honest confidence. You do not recommend anything: a fixed routing runs on your answers afterwards, and the person can flip any answer.

## user
The person's problem, in their own words:

<problem>
{{problem}}
</problem>

The questions, as JSON. Each has an id, the recipe a yes routes to, and its text:

```json
{{questions}}
```

For every question:
- Answer yes (`true`) only when the problem says it or clearly implies it. When the problem does not say, answer no (`false`) and lower your confidence.
- `confidence`: from 0 to 1, how sure you are of your answer given only what the problem says. Reserve 0.9 and above for what the problem states outright; inferences sit lower.
- `rationale`: one short line in plain words that points to what in the problem decided the answer.
- Judge each question on its own. Do not steer the answers toward any one recipe.

Some recipes have a choice the problem may already settle. For example, who writes the first draft: route `draft` is `own` when the person will write it themselves and `ai` when they want a draft written for them. Include a route only when the problem settles it.

## Answer format
One fenced ```json block, shaped like this:

    {"answers":[{"questionId":"…","answer":true,"confidence":0.8,"rationale":"…"}],"routes":{}}

- `answers`: one entry per question, in the order given, with the question's id as `questionId`.
- `routes`: the route choices the problem settles, as route id to branch name; an empty object when none.
