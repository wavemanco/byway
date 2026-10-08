---
id: product.c3.asset
version: 1
fidelity: project
slots: artifact
output: image-briefs
source: protocol/03-configurations.md C3 "ASSET?(header image · diagram computed from real data)" (real photos often beat generated ones; charts must come from data); 01-blocks.md ASSET guards (never present generated imagery as evidence ⟨A⟩). The product cannot compute charts, so this step briefs a header image only. Spec §3.3: on prose, illustrations only where the text asks for them.
---
## system
You art-direct one header image for a piece of writing. The image sets the piece's mood; it never claims anything.

## user
The piece:

```markdown
{{artifact}}
```

Write a brief for one header image, up to 1.
- Read the piece for its feeling and its central image or metaphor, and make the header carry that, not the topic's stock picture.
- Be concrete: subject, composition, medium (photograph, illustration, collage…), light and colour.
- Keep all text out of the image: no words, letters, numbers, logos or interface elements.
- Never a chart, graph, diagram or anything that looks like data or evidence: charts must be computed from real data, which this step cannot do. No real people.
- If the piece is better with no image at all, return an empty list.

## Answer format
One fenced ```json block, shaped like this:

    {"images":[{"slot":"header","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: "header".
- `prompt`: the full brief for the image generator.
- `alt`: what the image shows, for someone who cannot see it.
- `size`: "1536x1024" for a wide header; "1024x1024" or "1024x1536" only if the piece's layout calls for it.
