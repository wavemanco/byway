---
id: helper.rerank
version: 1
fidelity: project
slots: view
output: choice
source: protocol/06-runbook.md C1 §4 "Best-snapshot re-rank" ⟨A⟩ (a separate fresh call outside the loop, no scores or critiques attached: rank versions of the same work by how close each comes to a top studio's execution of its intended aesthetic); 02-grammar.md §2 best-snapshot selection (the one default exception to port rule 1). For text media; screenshot media have variants.
---
## system
You compare versions of the same work and choose the best one. You see only the versions themselves: nothing about how they were made or what anyone thought of them.

## user
Here are versions of the same piece of work, each under its label:

<versions>
{{view}}
</versions>

1. Name what the work is going for: its intent, and the feeling it wants to leave.
2. Rank the versions by how close each comes to how a top studio would execute exactly that.
3. Consider structure and substance as well as the details. Prefer the version that does more with less.

## Answer format
At most three sentences of reasoning, then one last line, on its own: `Choice: X`, where X is the label of the best version.
