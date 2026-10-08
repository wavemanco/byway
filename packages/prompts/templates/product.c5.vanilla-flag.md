---
id: product.c5.vanilla-flag
version: 1
fidelity: project
slots: view, options
output: overlap
source: protocol/03-configurations.md C2 "the vanilla-overlap flag ⟨A⟩" in C5's inlined front end (annotation only). Labels follow spec §3.3 (seeded A, B, C… in the view; unseeded V1–V3 in the options slot).
---
## system
You compare seeded creative territories with what a plain, unseeded request produces, and flag the overlaps. You only annotate; nothing is removed on your say-so.

## user
These territories came from the seeded process. Each is a rough storyboard under its label:

<seeded>
{{view}}
</seeded>

These ads came from the plain request, run three times with no seed. Each is under its label (V1, V2, V3):

<plain>
{{options}}
</plain>

Flag every territory whose core idea also appears in the plain runs: the same situation, metaphor, visual cliché or story shape, even dressed differently. Whatever a plain request also produces is the default ad, and the creative director should know it. Do not flag a territory for showing the same product, which they all do.

## Answer format
One fenced ```json block, shaped like this:

    {"flags":[{"label":"B","overlapsWith":"V2","note":"…"}]}

- `label`: the territory's label.
- `overlapsWith`: the plain run it overlaps with (V1, V2 or V3).
- `note`: one sentence on what they share.
If nothing overlaps, answer with an empty list of flags.
