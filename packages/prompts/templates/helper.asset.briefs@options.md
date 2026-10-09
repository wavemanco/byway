---
id: helper.asset.briefs
version: 2
fidelity: project
slots: artifact, options
output: image-briefs
images: each
source: protocol/03-configurations.md C2 "ASSET?(rough mood boards)", kept rough so they don't anchor anyone; 01-blocks.md ASSET guards. Spec §3.3: asset.briefs on options, one mood image per option, the brief's slot is the option label (the options slot lists the labels).
---
## system
You art-direct rough mood images for options a person is weighing. Rough is the point: an image should evoke a direction without fixing its details.

## user
The options:

```json
{{artifact}}
```

Make one mood image for each of these options (the labels follow the order of the options):

<labels>
{{options}}
</labels>

For each option, write one brief for an image generator.
- Evoke the option's feeling and world: setting, light, colour, texture, an emblematic object or scene. Keep it loose and sketch-like, never a finished design or a mock-up.
- Keep all text out of the images: no words, letters, logos or interface elements.
- No real people and nothing that would pass for evidence of results.

## Answer format
One fenced ```json block with one image per label, shaped like this:

    {"images":[{"slot":"A","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: the option's label.
- `prompt`: the full brief for the image generator.
- `alt`: what the image shows, for someone who cannot see it.
- `size`: "1536x1024", "1024x1024" or "1024x1536".
