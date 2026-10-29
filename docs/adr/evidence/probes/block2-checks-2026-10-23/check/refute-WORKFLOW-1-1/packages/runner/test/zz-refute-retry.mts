import { benchRun, putWork, storyboard, voiceBench, VoiceQuestion, voiceStep } from './helpers/voice-activity.ts';
const shots = (tagline: string, caps = ['Caption 1', 'Caption 2'], headline = 'Fresh at seven') =>
  storyboard({ voiceover: 'We bake before dawn.', headline, tagline, storyboard: caps.map((caption, i) => ({ shot: i + 1, caption })) });
const b = await voiceBench([]);
try {
  const late = voiceStep();
  // Pass 1: the late VOICE on the first pass's work. The person changes only the headline.
  const r = await benchRun(b, 'media');
  const q1 = await VoiceQuestion.open(b, r, await putWork(b, 'media', shots('Bread club')), late);
  console.log('PASS1 box:', JSON.stringify(q1.offered));
  const a1 = q1.offered!.replace('Fresh at seven', 'Warm at six');
  const f1 = await q1.answer(a1);
  console.log('PASS1 voiceId/deckId:', !!f1.voiceId, !!f1.deckId);
  // Pass 2: the work now has the second pass's tagline and a swapped caption (the person's pass-2 CUT/keep).
  const w2 = shots('Loaf club', ['Caption 1', 'Swapped caption 2']);
  const q2 = await VoiceQuestion.open(b, r, await putWork(b, 'media', w2), voiceStep({ id: 'late2' }), 'copy', { answerId: f1.voiceId!, deckId: f1.deckId! });
  console.log('PASS2 box:', JSON.stringify(q2.offered));
  console.log('PASS2 prompt:', JSON.stringify(q2.prompt));
  const f2 = await q2.answer(q2.offered!);
  const out = JSON.parse(await b.store.artifacts.getText(f2.artifactId!));
  console.log('PASS2 sent as offered -> delivered:', out.headline, '|', out.tagline, '|', out.storyboard.map((s: { caption: string }) => s.caption).join(' / '));
  // The person who reads the box and puts the second pass's tagline back gets it.
  const q3 = await VoiceQuestion.open(b, r, await putWork(b, 'media', w2), voiceStep({ id: 'late3' }), 'copy', { answerId: f1.voiceId!, deckId: f1.deckId! });
  const f3 = await q3.answer(q3.offered!.replace('Tagline: Bread club', 'Tagline: Loaf club'));
  const out3 = JSON.parse(await b.store.artifacts.getText(f3.artifactId!));
  console.log('PASS2 tagline edited back -> delivered:', out3.headline, '|', out3.tagline, '|', out3.storyboard.map((s: { caption: string }) => s.caption).join(' / '));
} finally {
  b.close();
}
