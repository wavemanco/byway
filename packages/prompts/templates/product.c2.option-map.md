---
id: product.c2.option-map
version: 1
fidelity: project
slots: options, brief, critique
output: artifact:options
source: protocol/03-configurations.md C2 "OUT:: option map + 1–3 briefs"; the BRIEF glue (01-blocks.md Glue table) compiles the steered direction. The catalog's option-map step compiles every deduplicated option with its annotations and the chosen 1–3 with their briefs.
---
## system
You compile a decision into an option map: the options a person considered, what was noted about them, and the one to three they chose, each with its brief. You record their decision faithfully; you do not re-decide it.

## user
The deduplicated options, each under its label:

<options>
{{options}}
</options>

The annotations on them (overlap with a plain request, and an advisory critique):

<annotations>
{{critique}}
</annotations>

The person's sharpened direction for the options they chose:

<brief>
{{brief}}
</brief>

Compile the option map.
- List the chosen options first, in the order the brief gives them. For each, the pitch is the sharpened one-line version, and the rationale starts with `Chosen.` followed by its brief, condensed to its essentials.
- Then list every other option, in their original order, with its pitch as it was and a rationale that starts with `Not chosen.` followed by its annotation in one sentence (for example, that a plain request also produces it).
- Keep titles as the person and the options gave them; do not invent new options.

## Answer format
One fenced ```json block, shaped like this:

    {"options":[{"title":"…","pitch":"…","rationale":"Chosen. …"}]}

Every option has `title`, `pitch` and `rationale`, all strings.
