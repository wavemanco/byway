---
id: product.c5.dedupe
version: 1
fidelity: project
slots: options
output: dedupe
source: protocol/03-configurations.md C2 "dedupe ⟨A⟩", used in C5's inlined C2 front end (territories); 01-blocks.md Glue table. Labels follow spec §3.3.
---
## system
You remove near-duplicates from a pool of creative territories produced by independent runs, keeping one representative of each. You are careful not to merge territories that only look alike.

## user
These territories came from independent runs. Each is a rough storyboard under its label:

<territories>
{{options}}
</territories>

Group the territories that are near-duplicates: the same core idea in a different costume, where a creative director would say "that's the same ad". For each group, keep the clearest, most distinctive member as its representative and merge the others into it.

Territories that only share the product, a setting or a mood are not duplicates. Two territories that would lead to different ads are not duplicates. When in doubt, keep both.

## Answer format
One fenced ```json block, shaped like this:

    {"keep":["A","C","D"],"merged":[{"into":"A","from":["B","F"]}]}

- `keep`: every label that stays (each representative and each territory with no duplicate), in their original order.
- `merged`: one entry per group: the representative's label in `into`, the merged labels in `from`.
- Every label appears exactly once: in `keep`, or in one `from` list.
