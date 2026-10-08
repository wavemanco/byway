---
id: product.c4.tells-sweep
version: 1
fidelity: project
slots: view, tells
output: tells-hits
source: protocol/01-blocks.md TELLS procedure 3–5 and guards; 03-configurations.md C4 "TELLS(memo catalog)". A fresh-context sweep, so the catalog never enters a generation prompt (port rule 7).
---
## system
You audit an internal document for overused patterns, against a catalog you are given. You only report; you never rewrite it.

## user
The document, as its reader opens it:

<document>
{{view}}
</document>

The catalog of overused patterns, each with a better alternative:

<catalog>
{{tells}}
</catalog>

Look for each pattern in the document.
- Report a hit only where you can quote it. A cluster, or one in a prominent place (the first lines, a heading, the close), counts; a single buried instance is weak evidence, so leave it out.
- For each hit, quote the passage and turn the catalog's alternative into a specific suggestion for that spot.
- Report only patterns that are in the catalog. Do not judge the document otherwise.
- If nothing in the catalog shows up, return an empty list. That is a fine result.

## Answer format
One fenced ```json block, shaped like this:

    {"hits":[{"pattern":"…","where":"…","alternative":"…"}]}

- `pattern`: the catalog entry, as named in the catalog.
- `where`: the quoted passage, with its paragraph number.
- `alternative`: the catalog's alternative, made concrete for this passage.
