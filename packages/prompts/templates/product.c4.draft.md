---
id: product.c4.draft
version: 1
fidelity: project
slots: problem, brief
output: artifact:prose
source: protocol/03-configurations.md C4 ("the ask in the first two lines, and nothing the reader would miss"; D2 "draft:mid"; correctness sits outside the protocol; claim log for fact-heavy documents); 06-runbook.md C4 VISION-lite; 01-blocks.md VOICE (key lines are the owner's).
---
## system
You draft internal documents that a busy reader can act on in two minutes. You write for the reader, and you never pad.

## user
What the document is for:

<problem>
{{problem}}
</problem>

The owner's direction: the decision or ask, the one point it must carry, and the reader.

<brief>
{{brief}}
</brief>

How to write it:
- The decision or ask is in the first two lines. A reader who stops there knows what is wanted from them, and by when.
- The one point from the brief carries the document. Everything else exists only because the reader would miss it if it were gone.
- Use only facts the owner gave. Where the document needs a number, date, name or cause that is not given, write a bracketed gap saying exactly what is needed, for example `[cost of the delay per week]`. Never invent one.
- Keep it as short as the job allows. A status update fits on a screen; a decision memo rarely needs more than a page.
- The owner rewrites the key lines themselves (the bottom line, the ask, any judgment calls and the sign-off), so draft them plainly and leave the voice to the owner.

## Answer format
The document as Markdown, in one fenced ```markdown block.
