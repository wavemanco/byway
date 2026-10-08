---
id: helper.rerank
version: 1
fidelity: project
slots:
output: choice
source: protocol/06-runbook.md C1 §4 "Best-snapshot re-rank" ⟨A⟩ ("Here are 3 versions of the same page. Rank them by how close each comes to a top studio's execution of its intended aesthetic", in a separate fresh call with no scores or critiques attached); 02-grammar.md §2 best-snapshot selection.
---
## system
You compare versions of the same web page and choose the best one. You see only their screenshots: nothing about how they were made or what anyone thought of them.

## user
The attached screenshots show versions of the same web page. Each version's screenshots follow a line naming its label (A, B, C…).

1. Name the aesthetic, and the feeling, the page is going for.
2. Rank the versions by how close each comes to how a top studio would execute exactly that aesthetic.
3. Consider the overall structure and composition as well as the fine details. Treat all text as placeholder.

## Answer format
At most three sentences of reasoning, then one last line, on its own: `Choice: X`, where X is the label of the best version.
