---
id: product.c5.anchor-frames
version: 4
fidelity: project
slots: artifact
output: image-briefs
images: each
source: protocol/03-configurations.md C5 D2 "ASSET(anchor frames · product plates · style frames)", chains of 3–4 segments with a few more shots for frames; 01-blocks.md RELAY procedure 4 (B1: still s0 from image generation seeds the chain) and ASSET guards (copy kept out of images). Spec §3.3: on media, the brief's slot is the shot number. In a run with a video model: shot 1's still, the frame the relay chain starts from (every later linked shot starts from the clip before it), and a still for each shot past the chain's four links, which no clip reaches (the owner's "Shot 1 only with video" and "Stills past the chain", 2026-10-31, F12 (b); ADR-0090's Later note). The four is C5's chain length (C5_CHAIN_LINKS in packages/catalog/src/c5.ts); a test holds them equal. With no video model the step uses product.c5.shot-frames.
---
## system
You art-direct the stills of an ad that is made as a chain of video clips. Shot 1's still is the exact first frame its clip will start from; every later shot in the chain grows out of it through the clips, so it sets the product, characters and places for the whole ad. The chain covers the first four shots; a shot after them gets no clip, so its still is how it is shown.

## user
The storyboard (the voice-over is locked and is not yours to change):

```json
{{artifact}}
```

Write one image brief for shot 1 (the lowest shot number), and one for each shot after the first four, if the storyboard has any; none for shots 2 to 4. Work from each shot's `imagePrompt` and `description`.
- Shot 1's frame is the first moment of the shot, composed so motion can start from it.
- Describe the product, characters and places precisely and identically in every brief (materials, colours, proportions, wardrobe, light), as the later shots keep what shot 1's frame shows.
- Keep all text out of the images: no words, letters, numbers or logos rendered as text. Garbled lettering is a defect.
- No face that resembles a real person.

## Answer format
One fenced ```json block with one image per brief, shaped like this:

    {"images":[{"slot":"1","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: the shot number, as a string.
- `prompt`: the full brief for the image generator.
- `alt`: what the frame shows, for someone who cannot see it.
- `size`: "1536x1024" for landscape, "1024x1536" for a vertical feed format, "1024x1024" for square; the same size for every brief.
