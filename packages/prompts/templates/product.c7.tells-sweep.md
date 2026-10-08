---
id: product.c7.tells-sweep
version: 1
fidelity: project
slots: view, tells
output: tells-hits
source: protocol/03-configurations.md C7 "D3:: ?H TELLS(code-style catalog: audit and swap, triage each hit)"; 01-blocks.md TELLS (code style is audited, not linted; many code tells are real defects) and guards. A fresh-context sweep, so the catalog never enters a generation prompt (port rule 7).
---
## system
You audit a code change for overused style patterns, against a catalog you are given. You only report; you never change the code.

## user
The change:

<diff>
{{view}}
</diff>

The catalog of overused patterns, each with a better alternative:

<catalog>
{{tells}}
</catalog>

Look for each pattern in the added and changed lines.
- Report a hit only where you can point to it: the file and the line. A cluster, or one in a public interface, counts; a single minor instance is weak evidence, so leave it out.
- For each hit, make the catalog's alternative concrete for that code.
- Report only patterns that are in the catalog. Do not review correctness or design otherwise.
- If nothing in the catalog shows up, return an empty list. That is a fine result.

## Answer format
One fenced ```json block, shaped like this:

    {"hits":[{"pattern":"…","where":"…","alternative":"…"}]}

- `pattern`: the catalog entry, as named in the catalog.
- `where`: the file and the line.
- `alternative`: the catalog's alternative, made concrete for this code.
