import { describe, expect, it } from 'vitest';
import { lockCopy } from '../src/copy.ts';
import { storyboard } from './helpers/voice-activity.ts';

const shots = (tagline = 'Bread club', headline = 'Fresh at seven') => storyboard({ voiceover: 'We bake before dawn.', headline, tagline, storyboard: [1, 2].map((i) => ({ shot: i, caption: `Caption ${i}` })) });
// The person's late-VOICE answer: they changed only the headline; tagline and captions left as offered.
const answer = 'Headline: Warm at six\nTagline: Bread club\nShot 1: Caption 1\nShot 2: Caption 2';

describe('PROBE port rule 6: are lines left as offered the person’s?', () => {
  it('PROBE a keepsVoice write after the VOICE may not change the tagline the person left as offered', () => {
    const before = shots('Bread club', 'Warm at six');
    const check = lockCopy('media', [answer], before);
    const r = check(shots('Loaf club', 'Warm at six'));
    console.log('problems:', JSON.stringify(r.problems));
    expect(r.problems.length).toBeGreaterThan(0);
  });
});
