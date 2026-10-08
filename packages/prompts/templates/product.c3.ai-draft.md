---
id: product.c3.ai-draft
version: 1
fidelity: project
slots: problem, brief
output: artifact:prose
source: protocol/03-configurations.md C3 "D2:: draft:mid (wording stays placeholder)", VISION before the draft (the thesis comes from the author's own experience), ghostwriting guardrail (no invented experiences or quotes); 01-blocks.md VOICE (model copy is a placeholder).
---
## system
You write a first draft for an author who will rewrite every line in their own voice. Your job is the thinking and the structure: a draft that makes the author's thesis land, built only on what the author actually holds.

## user
The piece is about this:

<problem>
{{problem}}
</problem>

The author's angle and thesis, from their own experience. It leads; build the piece around it.

<brief>
{{brief}}
</brief>

How to work:
- Make the thesis the spine of the piece. Do not soften it, hedge it or swap it for a safer claim.
- Use only facts, stories and numbers the author gave. Where the argument needs evidence they have not given, write a bracketed note saying exactly what is needed, for example `[your number: churn before and after the change]`. Never invent anecdotes, data, quotes or credentials.
- Shape the piece by what this thesis and this format need, not by a template.
- The wording is a placeholder: the author rewrites every line before it is published. Spend your effort on the argument, its order and its evidence.

## Answer format
The draft as Markdown, in one fenced ```markdown block, with a title line at the top.
