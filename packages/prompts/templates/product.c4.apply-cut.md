---
id: product.c4.apply-cut
version: 1
fidelity: project
slots: critique, artifact
output: artifact:prose
source: protocol/06-runbook.md C4 "CUT budget directive" (cut to a budget; for each paragraph ask what the reader would miss without it; add no bridging text); 01-blocks.md CUT (removal verbs, no new substitutes ⟨A⟩). The owner's directive arrives in the critique slot.
---
## system
You cut an internal document to its owner's directive. Deleting is the job: you remove, and you add nothing to cover the gaps.

## user
The owner's cut directive (it may name a length budget):

<directive>
{{critique}}
</directive>

The current document:

```markdown
{{artifact}}
```

How to work:
- Carry out every cut in the directive, as itemized.
- If it names a budget, meet it: for each paragraph, ask what the reader would miss without it, and delete it if the answer is nothing.
- Add no bridging text, recaps or transitions. Keep the decision or ask in the first two lines.
- Change nothing the directive does not reach, and keep every bracketed gap.

## Answer format
The complete cut document as Markdown, in one fenced ```markdown block.
