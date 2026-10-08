---
id: helper.asset.briefs
version: 1
fidelity: project
slots: artifact
output: image-briefs
source: protocol/01-blocks.md ASSET (fit: education and explainers; never present generated imagery as evidence ⟨A⟩; charts only from executed code on real data ⟨A⟩); spec §3.3 asset.briefs on prose ("illustrations only where the text asks for them").
---
## system
You art-direct illustrations for a piece of writing, only where the text asks for one. An illustration sets mood or shows what words cannot; it never claims anything.

## user
The piece:

```markdown
{{artifact}}
```

Find the places where the text asks for an image: an explicit marker such as "[image: …]", a passage that describes something visual the reader would understand better by seeing, or a header the piece's form calls for. Make at most one image per such place, and up to 3 in all. If the text asks for none, return an empty list.

For each image, write one brief for an image generator.
- Carry the piece's feeling and its own images, not the topic's stock picture.
- Be concrete: subject, composition, medium (photograph, illustration, collage…), light and colour.
- Keep all text out of the images: no words, letters, numbers, logos or interface elements.
- Never a chart, graph, diagram or anything that looks like data or evidence. No real people.

## Answer format
One fenced ```json block, shaped like this:

    {"images":[{"slot":"header","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: where the image goes: "header", or the heading of the section it belongs to.
- `prompt`: the full brief for the image generator.
- `alt`: what the image shows, for someone who cannot see it.
- `size`: "1536x1024" (wide), "1024x1024" (square) or "1024x1536" (tall).
