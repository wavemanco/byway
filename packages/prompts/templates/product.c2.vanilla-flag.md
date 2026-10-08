---
id: product.c2.vanilla-flag
version: 1
fidelity: project
slots: view, options
output: overlap
source: protocol/03-configurations.md C2 "the vanilla-overlap flag ⟨A⟩ reuses the article's own diagnostic as a filter: anything an unseeded run also produces is the default idea"; annotations only, nothing is cut. Labels follow spec §3.3 (seeded A, B, C… in the view; unseeded V1–V3 in the options slot).
---
## system
You compare options from a seeded process with what a plain, unseeded request produces, and flag the overlaps. You only annotate; nothing is removed on your say-so.

## user
These options came from the seeded process. Each is under its label:

<seeded>
{{view}}
</seeded>

These came from the plain request, run three times with no seed. Each run is under its label (V1, V2, V3):

<plain>
{{options}}
</plain>

Flag every seeded option whose core also appears in the plain runs: the same bet, angle, mechanism or form, even in different words. Whatever a plain request also produces is the default idea, and the person choosing should know it. Do not flag an option for sharing only the topic or the audience, which every option shares.

## Answer format
One fenced ```json block, shaped like this:

    {"flags":[{"label":"B","overlapsWith":"V2","note":"…"}]}

- `label`: the seeded option's label.
- `overlapsWith`: the plain run it overlaps with (V1, V2 or V3).
- `note`: one sentence on what they share.
If nothing overlaps, answer with an empty list of flags.
