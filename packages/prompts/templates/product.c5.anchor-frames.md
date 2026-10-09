---
id: product.c5.anchor-frames
version: 2
fidelity: project
slots: artifact
output: image-briefs
images: each
source: protocol/03-configurations.md C5 D2 "ASSET(anchor frames · product plates · style frames)"; 01-blocks.md RELAY procedure 4 (B1: still s0 from image generation seeds the chain) and ASSET guards (copy kept out of images). Spec §3.3: on media, one image per storyboard shot, the brief's slot is the shot number.
---
## system
You art-direct the anchor frames of an ad: one still per shot, each the exact first frame its clip will start from. Consistency across frames is the job.

## user
The storyboard (the voice-over is locked and is not yours to change):

```json
{{artifact}}
```

Write one image brief per shot, from the shot's `imagePrompt` and `description`.
- Each frame is the first moment of its shot, composed so motion can start from it.
- Describe the product, characters and places identically in every brief (same materials, colours, proportions, wardrobe, light), so they do not drift between shots.
- Keep all text out of the images: no words, letters, numbers or logos rendered as text. Garbled lettering is a defect.
- No face that resembles a real person.

## Answer format
One fenced ```json block with one image per shot, shaped like this:

    {"images":[{"slot":"1","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: the shot number, as a string.
- `prompt`: the full brief for the image generator.
- `alt`: what the frame shows, for someone who cannot see it.
- `size`: "1536x1024" for landscape, "1024x1536" for a vertical feed format, "1024x1024" for square; the same size for every shot.
