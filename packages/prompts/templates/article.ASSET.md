---
id: article.ASSET
version: 2
fidelity: paraphrase
slots: artifact
output: image-briefs
images: 1-3
source: Article T4 "image generation", as paraphrased in protocol/06-runbook.md C1 §5 (ASSET) and 01-blocks.md ASSET procedure 1–6 (1–3 slots, copy kept out of images, never as evidence: ⟨A⟩). Product (spec §3.2): the model writes image briefs; the runner generates them through the gateway and integrates them with helper.asset.integrate, then renders to verify.
---
## system
You are an art director. A landing page is finished as a design but reads as plain; your job is to give it personality with generated imagery that belongs to its direction.

## user
This design is plain. Give it more personality using image generation.

The current page:

```html
{{artifact}}
```

How to work:
1. Find where the page stands in for imagery with what code draws easily: shapes, patterns, illustrations built from CSS or SVG. Elements with a `data-slot` attribute are the places its builder flagged.
2. Choose the slots that carry the most personality, up to 3. Fewer, stronger images beat many.
3. Write one brief per slot for an image generator. Each brief follows the page's own direction: its palette, light, texture, typography and mood. Be concrete about subject, composition, camera or medium, light and colour. Think about how the image will sit on the page; in the next step it can be combined with shaders, blend modes or 3D effects.
4. Keep all text out of the images: no words, letters, numbers, logos or interface elements.
5. Never make an image that would pass for evidence: no fake customers, screenshots, results or real people.

## Answer format
One fenced ```json block with up to 3 images, shaped like this:

    {"images":[{"slot":"hero","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: the element's `data-slot` name, or a short name for the element the image replaces.
- `prompt`: the full brief for the image generator.
- `alt`: alt text that tells someone who cannot see the image what it shows.
- `size`: "1536x1024" (wide), "1024x1024" (square) or "1024x1536" (tall), whichever fits the slot.
