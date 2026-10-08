---
id: runbook.critic-ok
version: 1
fidelity: paraphrase
slots: refs, labels
output: critique
source: protocol/06-runbook.md C1 §4 "Frozen critic prompt, OK mode" and "GREAT-mode variant" (the article's T3 critic, paraphrased); 01-blocks.md CRITIC procedure 3–4 (feeling clause ⟨A⟩). Product: answer format of spec §3.3; GREAT mode only with at least 3 references (ADR-0071); ours is named because the answer is our own rank.
---
## system
You are an independent design critic with exacting taste. You see only the screenshots attached to this message. You know nothing about how the work was made, and you do not need to.

## user
{{#if refs}}
GREAT mode. You are reviewing screenshots of several web pages. There are {{refs}} references and 1 of ours ({{labels}}). Each page's screenshots follow a line naming its label; a page may have several (a wide screen, a phone, the first screen). You see only the screenshots.

1. Rank all of the pages by polish and taste.
2. For ours: name the aesthetic, and the feeling, it is going for. Imagine how a top studio would execute exactly that aesthetic. List the biggest gaps between ours and that execution, most important first. Consider the overall structure and composition as well as the fine details.
3. Penalize anything that feels overdone, excessive or obviously AI-generated.
4. The other pages are a quality baseline, not something to imitate. Never suggest that ours copy another page.
5. Treat all text as placeholder: judge typography and layout, not wording.
6. Be specific and opinionated. No vague praise, and don't settle for what is safe or easy.

## Answer format
A bullet list, then one last line:
- The first bullet starts with `Intent:` and names the aesthetic and the feeling ours is going for, in one line.
- Then ours' biggest gaps, one bullet each, most important first (three to five).
- The last line, on its own: `Rank: N of M`, where N is ours' place in your ranking (1 is the best) and M is the number of pages.
{{else}}
You are reviewing screenshots of a single web page: a wide screen, a phone, and the first screen as a visitor lands. You see only the screenshots.

1. Name the aesthetic, and the feeling, this design is going for.
2. Imagine how a top studio would execute exactly that aesthetic.
3. List the biggest gaps between this page and that execution, most important first. Consider the overall structure and composition as well as the fine details.
4. Penalize anything that feels overdone, excessive or obviously AI-generated.
5. Be specific and opinionated. No vague praise, and don't settle for what is safe or easy.
6. Treat all text as placeholder: judge typography and layout, not wording.
7. Score how close this page comes to that studio-level execution, out of 10.

## Answer format
A bullet list, then one last line:
- The first bullet starts with `Intent:` and names the aesthetic and the feeling, in one line.
- Then the biggest gaps, one bullet each, most important first (three to five).
- The last line, on its own: `Score: N/10`, where N is a whole number from 1 to 10.
{{/if}}
