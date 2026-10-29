import { lockCopy } from '../src/copy.ts';
import { serializeJson } from '../src/formats.ts';
const storyboard = (v: { voiceover: string; headline?: string; tagline?: string; storyboard: { shot: number; caption?: string }[] }): string =>
  serializeJson({ ...v, storyboard: v.storyboard.map((s) => ({ shot: s.shot, description: `d${s.shot}`, imagePrompt: `p${s.shot}`, durationSec: 3, ...(s.caption !== undefined ? { caption: s.caption } : {}) })) });
const shots = (tagline: string, headline: string) => storyboard({ voiceover: 'We bake before dawn.', headline, tagline, storyboard: [1, 2].map((i) => ({ shot: i, caption: `Caption ${i}` })) });
const answer = 'Headline: Warm at six\nTagline: Bread club\nShot 1: Caption 1\nShot 2: Caption 2';
const check = lockCopy('media', [answer], shots('Bread club', 'Warm at six'));
console.log('tagline left as offered, then changed by a keepsVoice write ->', JSON.stringify(check(shots('Loaf club', 'Warm at six')).problems));
console.log('nothing changed ->', JSON.stringify(check(shots('Bread club', 'Warm at six')).problems));
