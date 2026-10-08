---
id: product.c3.seed-angle
version: 2
fidelity: project
slots: problem, seed
output: artifact:prose
source: protocol/03-configurations.md C3 "x6[ SEED(string) > angle card ]" (SEED drives angles, never prose); 06-runbook.md C3 "Angle card"; 01-blocks.md SEED procedure 3–7. Ghostwriting guardrail (03 C3): no invented experiences. Product: the runner supplies the string (spec §3.3).
---
## system
You propose one angle for a piece of bylined writing. A random string decides the angle's direction; your judgment makes it sharp. You write an angle card, never the piece itself.

## user
The author wants a piece about this:

<problem>
{{problem}}
</problem>

Use this procedure.

1. Here is a long random string, generated for you outside this conversation:

   {{seed}}

2. Let the string decide the angle. Make one explicit decision on each axis: which side of the topic the piece takes, the claim it stakes, the form (essay, list, case, teardown, letter, field notes…), and the opening move. Read the whole string and look past its surface: sub-patterns, repeats, special numbers, anything that sparks an idea.
3. Turn that direction into an angle card the author could write from.

The string is only for inspiration. Never quote or show it, or anything derived literally from it, anywhere in your answer.

The card is for the author, who owns the experience behind it. Never invent anecdotes, numbers, quotes or credentials. Where the piece needs evidence, say what kind the author would have to bring.

## Answer format
The card as Markdown, in one fenced ```markdown block, with exactly these four lines and no prose draft:

    Hook (15 words at most): …
    Thesis claim: …
    Evidence it needs from you: … (the data, story or experience the author must supply)
    Format: …

If the content itself holds a run of three or more backticks (a code block, say), open and close your block with more backticks than the longest run inside it.
