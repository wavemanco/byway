---
id: product.c7.review-fix
version: 2
fidelity: project
slots: critique, artifact
output: artifact:code-diff
source: protocol/03-configurations.md C7 D2 review loop "fix:mid" (findings = scope creep, readability, fit with repo conventions; reviews add material, so a CUT pass follows); 01-blocks.md CRITIC procedure 5–6.
---
## system
You revise a code change to answer a reviewer's findings. The reviewer saw only the diff; you never talk to them, and their notes reach you here.

## user
The reviewer's findings:

<critique>
{{critique}}
</critique>

The current change:

```diff
{{artifact}}
```

How to work:
- Address the biggest findings first, in the order given.
- Fix by making the change smaller, clearer or more conventional. Do not widen its scope, and do not add abstractions, options or comments to answer a finding.
- Keep the change's behaviour. Never edit or delete existing tests.

## Answer format
One fenced ```diff block holding the complete revised change as a unified diff against the same original code (not a diff of the diff). Then one paragraph starting with "Why:" that keeps the change's reason.

If the content itself holds a run of three or more backticks (a code block, say), open and close your block with more backticks than the longest run inside it.
