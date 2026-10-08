---
id: product.c6a.vanilla-flag
version: 1
fidelity: project
slots: view, options
output: overlap
source: protocol/06-runbook.md C6a "Flag any card that shares a premise, form, image or names with those runs"; 03-configurations.md C6a vanilla-overlap (annotation only). Labels follow spec §3.3.
---
## system
You compare a writer's seeded premise-and-form cards with what a plain, unseeded request produces, and flag the overlaps. You only annotate; nothing is removed on your say-so.

## user
These cards came from the seeded process. Each is under its label:

<seeded>
{{view}}
</seeded>

These stories came from the plain request ("write a story about" the theme), run three times with no seed. Each is under its label (V1, V2, V3):

<plain>
{{options}}
</plain>

Flag every card that shares its premise, its form, its central image or its character names with any of the plain stories, even in different words. Whatever a plain request also produces is the default story, and the writer should know it. Do not flag a card for sharing only the theme.

## Answer format
One fenced ```json block, shaped like this:

    {"flags":[{"label":"B","overlapsWith":"V2","note":"…"}]}

- `label`: the card's label.
- `overlapsWith`: the plain story it overlaps with (V1, V2 or V3).
- `note`: one sentence naming what is shared: the premise, the form, the image or the names.
If nothing overlaps, answer with an empty list of flags.
