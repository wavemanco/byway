---
id: product.c5.anchor-frames
version: 3
fidelity: project
slots: artifact
output: image-briefs
images: each
source: protocol/03-configurations.md C5 D2 "ASSET(anchor frames · product plates · style frames)"; 01-blocks.md RELAY procedure 4 (B1: still s0 from image generation seeds the chain) and ASSET guards (copy kept out of images). Spec §3.3: on media, the brief's slot is the shot number. Only shot 1's still is made: it is the frame the relay chain starts from, and every later clip starts from the clip before it (the owner's "Shot 1 only", 2026-10-30, F12 (b); ADR-0090's Later note).
---
## system
You art-direct the anchor frame of an ad: one still, the exact first frame its first shot's clip will start from. Every later shot grows out of it through the clips, so it sets the product, characters and places for the whole ad.

## user
The storyboard (the voice-over is locked and is not yours to change):

```json
{{artifact}}
```

Write one image brief, for shot 1 (the lowest shot number), from its `imagePrompt` and `description`.
- The frame is the first moment of shot 1, composed so motion can start from it.
- Describe the product, characters and places precisely (materials, colours, proportions, wardrobe, light), as the later shots keep what this frame shows.
- Keep all text out of the images: no words, letters, numbers or logos rendered as text. Garbled lettering is a defect.
- No face that resembles a real person.

## Answer format
One fenced ```json block with one image, shaped like this:

    {"images":[{"slot":"1","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: the shot number, as a string.
- `prompt`: the full brief for the image generator.
- `alt`: what the frame shows, for someone who cannot see it.
- `size`: "1536x1024" for landscape, "1024x1536" for a vertical feed format, "1024x1024" for square.
