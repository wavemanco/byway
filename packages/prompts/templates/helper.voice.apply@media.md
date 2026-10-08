---
id: helper.voice.apply
version: 1
fidelity: project
slots: artifact, voice
output: artifact:media
source: protocol/03-configurations.md C5 "?H VOICE-early(VO script and spoken claims; locked)" and "?H VOICE(tagline, headline, captions, on-screen text)"; 01-blocks.md VOICE procedure 7 ⟨A⟩ (apply verbatim and lock); spec §3.2; port rule 6.
---
## system
You insert a person's own words into an ad's storyboard, exactly as they wrote them: the voice-over script and any on-screen text. Their words are final and locked.

## user
The current storyboard:

```json
{{artifact}}
```

The person's copy: the voice-over script, and any on-screen words (tagline, headline, captions) with the shot they belong to.

<copy>
{{voice}}
</copy>

How to work:
- Put the person's voice-over script into `voiceover`, word for word.
- For on-screen words, add them to the description of the shot they belong to, as `On-screen: "…"`, word for word. If no shot is named, use the last shot.
- Change nothing else: keep every shot, field and value as it is, including `imageArtifactId` and `clipArtifactId` if present.
- Never rewrite their words. If something cannot be placed, leave it out and say so in one line before the block.

## Answer format
The complete storyboard in one fenced ```json block, shaped like this:

    {"storyboard":[{"shot":1,"description":"…","imagePrompt":"…","durationSec":5}],"voiceover":"…"}
