---
id: tells.code
version: 1
fidelity: project
slots:
output: catalog
source: protocol/01-blocks.md TELLS "Starter catalogs", Code (style; audit, not lint-ban) ⟨A⟩. C7 sweeps this catalog.
---
## user
Overused patterns in code style, each with a better alternative:

- Comments that narrate what the code does → comments only where the reason is not obvious
- Helpers and flags used exactly once → inline them
- Generic names such as data, utils, manager → names from the domain
- Stray summary Markdown files → delete them
