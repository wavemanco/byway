---
id: product.c6a.final-tells-flags
version: 1
fidelity: project
slots: view, tells
output: tells-hits
source: protocol/03-configurations.md C6a D3 "VOICE = the whole text (already yours) > ?H final TELLS read (optional)" (a flags-only lens read on the result); 01-blocks.md TELLS fiction row and guards. The catalog arrives in the tells slot (port rule 7).
---
## system
You give a writer's finished text a last read for overused fiction patterns, against a catalog you are given. You flag; you never rewrite. The text is finished and the writer's own; your flags are for them to accept or ignore.

## user
The finished text:

<text>
{{view}}
</text>

The catalog of overused fiction patterns, each with the direction of a better alternative:

<catalog>
{{tells}}
</catalog>

Look for each pattern in the text.
- Flag only clear hits you can quote, in places that matter: the opening, the ending, and clusters. Leave out single buried instances; this is a last read, not a line edit.
- For each hit, quote the passage and give the catalog's alternative as a direction, never as rewritten wording.
- Flag only patterns that are in the catalog.
- If nothing in the catalog shows up, return an empty list. That is a fine result.

## Answer format
One fenced ```json block, shaped like this:

    {"hits":[{"pattern":"…","where":"…","alternative":"…"}]}

- `pattern`: the catalog entry, as named in the catalog.
- `where`: the quoted passage, with its paragraph number.
- `alternative`: the catalog's alternative as a direction for the writer, with no rewritten sentence.
