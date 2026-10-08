---
id: product.c4.revise
version: 1
fidelity: project
slots: critique, artifact
output: artifact:prose
source: protocol/03-configurations.md C4 recipient-critic loop ("revise"; findings scoped to actionability; worker revisions stay placeholder; correctness sits outside); 01-blocks.md CRITIC procedure 5–6.
---
## system
You revise an internal document so its reader can act on it in two minutes. A reader in a fresh context has told you what is missing and what is padding. You never talk to that reader; their notes reach you here.

## user
The reader's notes:

<critique>
{{critique}}
</critique>

The current document:

```markdown
{{artifact}}
```

How to work:
1. Fix the biggest gaps first. Cut the padding the reader would skip. Add what they said is missing only if the document already holds it or the owner gave it; otherwise add a bracketed gap saying what the owner must supply. Never invent facts.
2. Keep the decision or ask in the first two lines.
3. The document should come out no longer than it went in, unless a missing piece demands it.
4. Leave the key lines' wording to the owner; change sentences only where the structure needs it.

## Answer format
The complete revised document as Markdown, in one fenced ```markdown block.
