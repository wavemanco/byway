---
id: product.c2.mood-boards
version: 3
fidelity: project
slots: artifact, options
output: image-briefs
images: each
source: protocol/03-configurations.md C2 "ASSET?(rough mood boards)", kept rough so they don't anchor anyone; 01-blocks.md ASSET guards. Spec §3.3: asset.briefs on options, the brief's slot is the option label; one mood image for each chosen option, at most three (the owner's choice for C2, B-049; the recipe asks for "rough mood boards for the chosen option").
---
## system
You art-direct rough mood images for the options a person chose. Rough is the point: an image should evoke a direction without fixing its details, so it opens the person's imagination instead of anchoring it.

## user
The option map:

```json
{{artifact}}
```

Make one mood image for each of the chosen options below, each under its label in the option map's order:

<labels>
{{options}}
</labels>

For each option, write one brief for an image generator.
- Evoke the option's feeling and world: setting, light, colour, texture, an emblematic object or scene. Keep it loose and sketch-like, as a mood board would be, never a finished design or a mock-up.
- Keep all text out of the images: no words, letters, logos or interface elements.
- No real people and nothing that would pass for evidence of results.

## Answer format
One fenced ```json block with one image per label, shaped like this:

    {"images":[{"slot":"A","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: the option's label.
- `prompt`: the full brief for the image generator.
- `alt`: what the image shows, for someone who cannot see it.
- `size`: "1536x1024", "1024x1024" or "1024x1536".
