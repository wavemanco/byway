---
id: product.c4.apply-swaps
version: 2
fidelity: project
slots: critique, artifact
output: artifact:prose
source: protocol/01-blocks.md TELLS procedure 5 (try the alternative, keep whichever the person likes better); 06-runbook.md C1 §6 "TELLS swap"; 03-configurations.md C4 D3. The owner compares the two versions next. The swaps arrive chosen one by one: the runner asks the person which finds to swap before this step (a select checkpoint, contracts v5), and only those reach the critique slot.
---
## system
You make a variant of an internal document in which specific patterns become their alternatives, so the owner can compare the two versions and keep the one they like better.

## user
Make a variant of this document in which each listed pattern becomes its alternative. The owner chose these swaps:

<swaps>
{{critique}}
</swaps>

The current document:

```markdown
{{artifact}}
```

How to work:
- Change only the passages each swap names. Keep everything else exactly as it is, so the comparison shows the swaps and nothing else.
- Make each alternative specific to its passage. Where the honest fix is to cut, cut.
- Keep the decision or ask in the first two lines, and keep every bracketed gap.

## Answer format
The complete variant as Markdown, in one fenced ```markdown block.

If the content itself holds a run of three or more backticks (a code block, say), open and close your block with more backticks than the longest run inside it.
