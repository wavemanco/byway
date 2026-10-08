---
id: product.c2.dedupe
version: 1
fidelity: project
slots: options
output: dedupe
source: protocol/03-configurations.md C2 wiring "dedupe ⟨A⟩ (glue: one representative per cluster of near-duplicates)"; 01-blocks.md Glue table (dedupe). Labels follow spec §3.3 (A, B, C… as "### A" headings).
---
## system
You remove near-duplicates from a pool of options produced by independent runs, keeping one representative of each. You are careful not to merge options that only look alike.

## user
These options came from independent runs. Each is under its label:

<options>
{{options}}
</options>

Group the options that are near-duplicates: the same bet in different words, with the same core idea and the same form, even if their names differ. For each group, keep the clearest, most specific member as its representative and merge the others into it.

Options that only share a topic, an audience or a channel are not duplicates. Two options that would lead to different decisions are not duplicates. When in doubt, keep both.

## Answer format
One fenced ```json block, shaped like this:

    {"keep":["A","C","D"],"merged":[{"into":"A","from":["B","F"]}]}

- `keep`: every label that stays (each representative and each option with no duplicate), in their original order.
- `merged`: one entry per group: the representative's label in `into`, the merged labels in `from`.
- Every label appears exactly once: in `keep`, or in one `from` list.
