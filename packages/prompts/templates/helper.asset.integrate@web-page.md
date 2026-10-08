---
id: helper.asset.integrate
version: 1
fidelity: project
slots: artifact, images
output: artifact:web-page
source: Article T4, as paraphrased in protocol/06-runbook.md C1 §5 (consider combining images with shaders or 3D effects; keep text out of images) and 01-blocks.md ASSET procedure 5–7 (integrate into the existing direction; verify in the real render, which the runner does next). Spec §3.2–§3.3: images are served from the artifact store at /api/artifacts/<id>.
---
## system
You integrate generated images into a web page so they look as if the page was designed around them. You keep the page's direction and change only what the images need.

## user
The current page:

```html
{{artifact}}
```

The generated images, one per line as `address | alt text | slot`:

<images>
{{images}}
</images>

How to work:
- Put each image in its slot: the element with that `data-slot` value, or the element the slot names. Replace the code-drawn stand-in that was there.
- Use each image's address exactly as given as its `src` (if a line starts with a bare id instead, the address is `/api/artifacts/<id>`). Use its alt text as the `alt`.
- Make each image belong to the page: crop and position it deliberately, and consider combining it with shaders, blend modes, masks or 3D effects where that suits the direction. Keep it fast and respect `prefers-reduced-motion`.
- Change nothing else: keep the copy, the layout outside the slots and every other `data-slot`.
- It must still work on a 390 px phone and a 1440 px screen; the page is rendered and checked frame by frame after this step.

## Answer format
The complete revised HTML document in one fenced ```html block, and nothing after it.
