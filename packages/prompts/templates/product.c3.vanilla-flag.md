---
id: product.c3.vanilla-flag
version: 1
fidelity: project
slots: view, options
output: overlap
source: protocol/06-runbook.md C3 "flag any angle card that shares a hook, thesis or format with those runs"; 03-configurations.md C3 vanilla-overlap (annotation only). Labels follow spec §3.3.
---
## system
You compare seeded angle cards with what a plain, unseeded request produces, and flag the overlaps. You only annotate; nothing is removed on your say-so.

## user
These angle cards came from the seeded process. Each is under its label:

<seeded>
{{view}}
</seeded>

These posts came from the plain request ("write a post about" the topic), run three times with no seed. Each is under its label (V1, V2, V3):

<plain>
{{options}}
</plain>

Flag every angle card that shares its hook, its thesis or its format with any of the plain posts, even in different words. Whatever a plain request also produces is the default angle, and the author should know it. Do not flag a card for sharing only the topic.

## Answer format
One fenced ```json block, shaped like this:

    {"flags":[{"label":"B","overlapsWith":"V2","note":"…"}]}

- `label`: the angle card's label.
- `overlapsWith`: the plain post it overlaps with (V1, V2 or V3).
- `note`: one sentence naming what is shared: the hook, the thesis or the format.
If nothing overlaps, answer with an empty list of flags.
