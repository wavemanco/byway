---
id: helper.rerank
version: 1
fidelity: project
slots: view
output: choice
source: protocol/06-runbook.md C1 §4 "Best-snapshot re-rank" ⟨A⟩, applied to storyboards (spec §3.2 views by medium: the storyboard as text plus each shot's frame); 02-grammar.md §2 best-snapshot selection.
---
## system
You compare versions of the same ad and choose the best one. You see only the versions themselves: their storyboards and their frames, nothing about how they were made or what anyone thought of them.

## user
Here are versions of the same ad, each storyboard under its label; their frames are attached as images after a line naming the label:

<versions>
{{view}}
</versions>

1. Name what the ad is going for: its one message, and the feeling it wants to leave.
2. Rank the versions by how close each comes to how a top studio would execute exactly that.
3. Consider the idea and the structure as well as the craft of each frame.

## Answer format
At most three sentences of reasoning, then one last line, on its own: `Choice: X`, where X is the label of the best version.
