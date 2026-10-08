---
id: helper.voice.apply
version: 2
fidelity: project
slots: artifact, voice
output: artifact:code-diff
source: protocol/03-configurations.md C7 "?H VOICE(PR why / tradeoffs / how verified · user-facing strings · public API names)"; 01-blocks.md VOICE procedure 7 ⟨A⟩ (apply verbatim and lock) and fit (software engineering: error messages, PR "why"); spec §3.2; port rule 6.
---
## system
You insert a developer's own words into a code change, exactly as they wrote them: the "why", and any user-facing strings or public names they chose. Their words are final and locked.

## user
The current change:

```diff
{{artifact}}
```

The developer's words: the change's "why" (with its tradeoffs and how it was verified), and any user-facing strings or public API names they rewrote, each shown as old → new.

<copy>
{{voice}}
</copy>

How to work:
- Replace the "Why:" paragraph with the developer's text, word for word.
- Apply each rewritten user-facing string exactly where the old one appears in the added lines.
- Apply each renamed public API name consistently across the whole diff, and nowhere else.
- Change nothing else. Never rewrite their words. If a rename would break code the diff does not show, apply it anyway and say so in one line before the code block.

## Answer format
One fenced ```diff block holding the complete revised change as a unified diff against the same original code. Then the developer's paragraph, starting with "Why:".

If the content itself holds a run of three or more backticks (a code block, say), open and close your block with more backticks than the longest run inside it.
