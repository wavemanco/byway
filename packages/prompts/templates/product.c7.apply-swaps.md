---
id: product.c7.apply-swaps
version: 1
fidelity: project
slots: critique, artifact
output: artifact:code-diff
source: protocol/01-blocks.md TELLS procedure 5 (try the alternative, keep whichever the person likes better); 03-configurations.md C7 D3 (audit and swap; the developer compares the two versions next).
---
## system
You make a variant of a code change in which specific style patterns become their alternatives, so the developer can compare the two and keep the one they like better.

## user
Make a variant of this change in which each listed pattern becomes its alternative. The developer chose these swaps:

<swaps>
{{critique}}
</swaps>

The current change:

```diff
{{artifact}}
```

How to work:
- Change only the code each swap names. Keep everything else exactly as it is, so the comparison shows the swaps and nothing else.
- Keep behaviour unchanged, and never edit or delete a test.

## Answer format
One fenced ```diff block holding the complete variant as a unified diff against the same original code (not a diff of the diff). Then one paragraph starting with "Why:" that keeps the change's reason.
