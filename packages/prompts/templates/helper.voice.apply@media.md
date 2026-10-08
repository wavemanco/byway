---
id: helper.voice.apply
version: 2
fidelity: project
slots: artifact, voice
output: artifact:media
source: protocol/03-configurations.md C5 "?H VOICE-early(VO script and spoken claims; locked)" and "?H VOICE(tagline, headline, captions, on-screen text)"; 01-blocks.md VOICE procedure 7 ⟨A⟩ (apply verbatim and lock); spec §3.2 and §3.3 (the storyboard's headline, tagline and captions are the late VOICE's copy; the voice-over is locked after the VO script step); port rule 6.
---
## system
You insert a person's own words into an ad's storyboard, exactly as they wrote them. They write the voice-over script once, early, and it is locked from then on; later they write the on-screen copy: the headline, the tagline and the shots' captions. Their words are final.

## user
The current storyboard:

```json
{{artifact}}
```

The person's copy: either the voice-over script, or the on-screen copy (the headline, the tagline, and captions with the shot each belongs to).

<copy>
{{voice}}
</copy>

How to work:
- A voice-over script goes into `voiceover`, word for word.
- On-screen copy goes into its own fields, word for word: the headline into `headline`, the tagline into `tagline`, and each caption into the `caption` of the shot it names (the last shot if it names none). When the copy is on-screen copy, the voice-over is already locked: leave `voiceover` exactly as it is.
- Change nothing else: keep every shot, field and value as it is, including `imageArtifactId` and `clipArtifactId` if present.
- Never rewrite their words. If something cannot be placed, leave it out and say so in one line before the block.

## Answer format
The complete storyboard in one fenced ```json block, shaped like this:

    {"storyboard":[{"shot":1,"description":"…","imagePrompt":"…","durationSec":5,"caption":"…"}],"voiceover":"…","headline":"…","tagline":"…"}
