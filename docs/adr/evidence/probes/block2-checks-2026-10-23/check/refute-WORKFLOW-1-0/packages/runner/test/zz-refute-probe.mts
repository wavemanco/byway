// Refuter probe for WORKFLOW-1 (not part of the suite): the second late VOICE after a gate's retry, on the real activities.
import { lockCopy } from '../src/copy.ts';
import { INPUT_MEDIA_TYPE } from '../src/stored-inputs.ts';
import { benchRun, putWork, storyboard, voiceBench, VoiceQuestion, voiceStep } from './helpers/voice-activity.ts';

const board = (tagline: string, cap2: string) =>
  storyboard({ voiceover: 'We bake before dawn.', headline: 'Fresh at seven', tagline, storyboard: [{ shot: 1, caption: 'Caption 1' }, { shot: 2, caption: cap2 }] });

const b = await voiceBench();
try {
  // Pass 1: the late VOICE as first asked. The person changes only the headline.
  const r1 = await benchRun(b, 'media');
  const work1 = await putWork(b, 'media', board('Bread club', 'Caption 2'));
  const q1 = await VoiceQuestion.open(b, r1, work1, voiceStep());
  console.log('PASS1 box:', JSON.stringify(q1.offered));
  const answer1 = q1.offered!.replace('Headline: Fresh at seven', 'Headline: Warm at six');
  const out1 = await q1.answer(answer1);
  console.log('PASS1 voiceId/deckId kept:', !!out1.voiceId, !!out1.deckId);

  // byway's own semantics for that answer: a later keepsVoice writer is held to the WHOLE on-screen deck, the tagline
  // the person left as offered included (lockCopy, port rule 6).
  const written1 = await b.store.artifacts.getText(out1.artifactId!);
  const changedTagline = written1.replace('"Bread club"', '"Other club"');
  console.log('lockCopy after pass-1 answer, a writer changing only the tagline:', JSON.stringify(lockCopy('media', [answer1], written1)(changedTagline).problems));

  // Pass 2: the work now carries the second pass's own copy (its CUT and A/B swaps, say): another tagline and caption 2.
  const r2 = await benchRun(b, 'media');
  const work2 = await putWork(b, 'media', board('Loaf club', 'Caption two'));
  const earlier = { answerId: out1.voiceId!, deckId: out1.deckId! };
  const q2 = await VoiceQuestion.open(b, r2, work2, voiceStep(), 'copy', earlier);
  console.log('PASS2 box:', JSON.stringify(q2.offered));
  console.log('PASS2 prompt:', JSON.stringify(q2.prompt));
  console.log('PASS2 deckId is the work deck:', q2.deckId === (await b.store.artifacts.putText('Headline: Fresh at seven\nTagline: Loaf club\nShot 1: Caption 1\nShot 2: Caption two', INPUT_MEDIA_TYPE)).id);
  const cp = await b.store.getCheckpoint(`${r2.runId}/cp1-voice`);
  console.log('PASS2 checkpoint shows the work beside the box:', JSON.stringify(cp?.artifactIds), cp?.artifactIds?.[0] === work2);
  const out2 = await q2.answer(q2.offered!);
  const delivered = JSON.parse(await b.store.artifacts.getText(out2.artifactId!)) as { headline: string; tagline: string; storyboard: { caption: string }[] };
  console.log('PASS2 delivered (box sent back as offered):', delivered.headline, '/', delivered.tagline, '/', delivered.storyboard.map((s) => s.caption).join(' | '));
} finally {
  b.close();
}
