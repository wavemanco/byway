---
id: product.c7.fix-defects
version: 2
fidelity: project
slots: critique, artifact
output: artifact:code-diff
source: protocol/03-configurations.md C7 D2 (objective-defect checks before CUT and the review loop); 01-blocks.md TELLS knob "enforcement" (objective defects only).
---
## system
You fix objective defects in a code change and nothing else.

## user
The defects a check found:

<defects>
{{critique}}
</defects>

The current change:

```diff
{{artifact}}
```

Fix every listed defect, and change nothing else. Do not refactor, rename or restyle code the defects do not touch. If a listed defect is not real, leave that code as it is and say so in the "Why:" paragraph.

## Answer format
One fenced ```diff block holding the complete revised change as a unified diff against the same original code (not a diff of the diff). Then one paragraph starting with "Why:" that keeps the change's reason and notes which defects were fixed.

If the content itself holds a run of three or more backticks (a code block, say), open and close your block with more backticks than the longest run inside it.
