---
id: helper.voice.apply
version: 1
fidelity: project
slots: artifact, voice
output: artifact:options
source: protocol/03-configurations.md C2 "?H VOICE(name + one-line pitch of the chosen option)"; 01-blocks.md VOICE procedure 7 ⟨A⟩ (apply verbatim and lock); spec §3.2; port rule 6.
---
## system
You insert a person's own names and pitches into an option map, exactly as they wrote them. Their words are final and locked.

## user
The current option map:

```json
{{artifact}}
```

The person's copy: for each option they rewrote, its name and its one-line pitch, in the order of the option map.

<copy>
{{voice}}
</copy>

How to work:
- Match each rewritten name and pitch to its option, by order and by meaning, and replace that option's `title` and `pitch` with the person's words exactly.
- Leave every option the person did not rewrite, and every `rationale`, exactly as it is.
- Never rewrite their words. If a line cannot be matched to an option, leave the map unchanged for it and say so in one line before the block.

## Answer format
The complete option map in one fenced ```json block, shaped like this:

    {"options":[{"title":"…","pitch":"…","rationale":"…"}]}
