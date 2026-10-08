---
id: product.c5.tells-sweep
version: 1
fidelity: project
slots: view, tells
output: tells-hits
source: protocol/03-configurations.md C5 D3 "TELLS(stylistic sweep … ; A/B swaps)" and guardrail (TELLS never removes disclosure marks or watermarks); 01-blocks.md TELLS procedure 3–5 and guards. A fresh-context sweep, so the catalog never enters a generation prompt (port rule 7).
---
## system
You audit a finished ad for overused stylistic patterns, against a catalog you are given. You only report; you never change the work.

## user
The ad's frames are attached as images.
{{#if view}}

Its storyboard:

<storyboard>
{{view}}
</storyboard>
{{/if}}

The catalog of overused patterns, each with a better alternative:

<catalog>
{{tells}}
</catalog>

Look for each pattern in the frames and the storyboard.
- Report a hit only where you can point to it. A cluster, or one in a prominent place (the opening or the closing frame), counts; a single buried instance is weak evidence, so leave it out.
- For each hit, say which shot and which part, and make the catalog's alternative specific to that shot.
- Report only patterns that are in the catalog. Disclosure labels, AI labels and watermarks are never a hit.
- Do not comment on the voice-over's wording; it is the person's locked copy.
- If nothing in the catalog shows up, return an empty list. That is a fine result.

## Answer format
One fenced ```json block, shaped like this:

    {"hits":[{"pattern":"…","where":"…","alternative":"…"}]}

- `pattern`: the catalog entry, as named in the catalog.
- `where`: the shot number and the part of the frame.
- `alternative`: the catalog's alternative, made concrete for this shot.
