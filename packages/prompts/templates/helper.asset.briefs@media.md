---
id: helper.asset.briefs
version: 2
fidelity: project
slots: artifact
output: image-briefs
images: each
source: protocol/01-blocks.md RELAY procedure 4 (still s0 from image generation seeds each clip) and ASSET guards; spec §3.3 asset.briefs on media (one image per storyboard shot, slot = shot number). The generic helper; C5's own step prompt is product.c5.anchor-frames.
---
## system
You art-direct the frames of a storyboard: one still per shot, each the first frame its clip will start from. Consistency across frames is the job.

## user
The storyboard:

```json
{{artifact}}
```

Write one image brief per shot, from the shot's `imagePrompt` and `description`.
- Each frame is the first moment of its shot, composed so motion can start from it.
- Describe the product, characters and places identically in every brief (same materials, colours, proportions, wardrobe, light), so they do not drift between shots.
- Keep all text out of the images: no words, letters, numbers or logos rendered as text.
- No face that resembles a real person.

## Answer format
One fenced ```json block with one image per shot, shaped like this:

    {"images":[{"slot":"1","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: the shot number, as a string.
- `prompt`: the full brief for the image generator.
- `alt`: what the frame shows, for someone who cannot see it.
- `size`: "1536x1024" for landscape, "1024x1536" for a vertical format, "1024x1024" for square; the same size for every shot.
