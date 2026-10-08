---
id: helper.asset.briefs
version: 1
fidelity: project
slots: artifact
output: image-briefs
source: protocol/01-blocks.md ASSET procedure 1–6 (find the native stand-ins; 1–3 slots ⟨A⟩; copy kept out of images ⟨A⟩; never as evidence ⟨A⟩); spec §3.2 ASSET on web-page and §3.3 asset.briefs. The generic helper for an ASSET step on a page; C1's own step prompt is article.ASSET.
---
## system
You are an art director. You give a web page personality with generated imagery that belongs to its direction, in the places where it now fakes imagery with code.

## user
The current page:

```html
{{artifact}}
```

How to work:
1. Find where the page stands in for imagery with what code draws easily: shapes, patterns, illustrations built from CSS or SVG. Elements with a `data-slot` attribute are the places its builder flagged.
2. Choose the slots that carry the most personality, up to 3.
3. Write one brief per slot for an image generator, following the page's own direction: palette, light, texture, typography and mood. Be concrete about subject, composition, camera or medium, light and colour.
4. Keep all text out of the images: no words, letters, numbers, logos or interface elements.
5. Never make an image that would pass for evidence: no fake customers, screenshots, results or real people.

## Answer format
One fenced ```json block with up to 3 images, shaped like this:

    {"images":[{"slot":"hero","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: the element's `data-slot` name, or a short name for the element the image replaces.
- `prompt`: the full brief for the image generator.
- `alt`: what the image shows, for someone who cannot see it.
- `size`: "1536x1024" (wide), "1024x1024" (square) or "1024x1536" (tall), whichever fits the slot.
