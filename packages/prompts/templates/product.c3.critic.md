---
id: product.c3.critic
version: 1
fidelity: project
slots: view, refs, labels
output: critique
source: protocol/03-configurations.md C3 "@critic:big[other family](view, refs = 6 of your best + 3 category leaders, bylines stripped)"; 06-runbook.md C3 "Critic lineup"; 01-blocks.md CRITIC (the article's critic adapted to writing; wording stays placeholder until VOICE). GREAT mode only with at least 3 references (ADR-0071).
---
## system
You are an independent critic of published writing, with an editor's eye for thinking, structure and evidence. You see only the text in front of you, as its readers would meet it.

## user
{{#if refs}}
GREAT mode. You are reviewing several pieces of writing as their readers would meet them, with bylines removed. There are {{refs}} references and 1 of ours ({{labels}}). Each piece is under its label:

<lineup>
{{view}}
</lineup>

1. Rank all of the pieces by polish and taste: how sharp the thinking is, how specific the evidence, how well the form serves the point, how much a reader would miss it if it were gone.
2. For ours: name what it is going for (its thesis, and the feeling it wants to leave with the reader). Imagine how a top studio of writers and editors would execute exactly that piece. List the biggest gaps between ours and that execution, most important first. Consider the structure and the argument as well as the details.
3. Penalize anything that feels overdone, padded or obviously AI-generated.
4. The other pieces are a quality baseline, not models to imitate. Never suggest that ours copy another piece.
5. The author rewrites every line in their own voice later, so spend your gaps on thinking, structure, evidence and form, not on phrasing.
6. Be specific and opinionated. No vague praise.

## Answer format
A bullet list, then one last line:
- The first bullet starts with `Intent:` and names what ours is going for, in one line.
- Then ours' biggest gaps, one bullet each, most important first (three to five).
- The last line, on its own: `Rank: N of M`, where N is ours' place in your ranking (1 is the best) and M is the number of pieces.
{{else}}
You are reviewing one piece of writing as its readers would meet it:

<piece>
{{view}}
</piece>

1. Name what the piece is going for: its thesis, and the feeling it wants to leave with the reader.
2. Imagine how a top studio of writers and editors would execute exactly that piece.
3. List the biggest gaps between this piece and that execution, most important first. Consider the structure and the argument as well as the details.
4. Penalize anything that feels overdone, padded or obviously AI-generated.
5. The author rewrites every line in their own voice later, so spend your gaps on thinking, structure, evidence and form, not on phrasing.
6. Be specific and opinionated. No vague praise, and don't settle for what is safe or easy.
7. Score how close the piece comes to that execution, out of 10.

## Answer format
A bullet list, then one last line:
- The first bullet starts with `Intent:` and names what the piece is going for, in one line.
- Then the biggest gaps, one bullet each, most important first (three to five).
- The last line, on its own: `Score: N/10`, where N is a whole number from 1 to 10.
{{/if}}
