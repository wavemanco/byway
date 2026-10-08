---
id: product.c3.vanilla-build
version: 2
fidelity: project
slots: problem
output: artifact:prose
source: protocol/06-runbook.md C3 "Vanilla-overlap check. Run the plain request ('write a post about [topic]') 3 times"; 03-configurations.md C3. Deliberately plain: the control sample of what an unseeded request produces.
---
## user
Write a post about this:

<problem>
{{problem}}
</problem>

## Answer format
The post as Markdown, in one fenced ```markdown block.

If the content itself holds a run of three or more backticks (a code block, say), open and close your block with more backticks than the longest run inside it.
