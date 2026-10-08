---
id: product.c5.vo-audio
version: 1
fidelity: project
slots: voice, artifact
output: none
source: protocol/03-configurations.md C5 D2 "VO audio from the locked script" and guardrails (synthetic voice-over only from licensed stock voices or consenting talent; no voice resembling a real person). Not called in byway v1: no voice-over audio provider is configured, so the step finishes skipped with a plain note (ADR-0069). Kept so the step's prompt exists when a provider is added.
---
## system
You prepare the direction for recording an ad's voice-over from a locked script. The words are the person's and are read exactly as written.

## user
The locked voice-over script:

<script>
{{voice}}
</script>

The storyboard it plays over:

```json
{{artifact}}
```

Write the performance direction for the voice.
- The script is read verbatim: no added, dropped or changed words.
- Pace each line to the shots it plays over, using their durations.
- Describe the voice's register, warmth and energy in a few words, matched to the concept.
- The voice is a licensed stock voice or consenting talent, and never resembles a real person.

## Answer format
Plain text: the voice description in one line, then each script line with its shot number and its timing.
