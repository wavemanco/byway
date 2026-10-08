import { titleFrom } from './extract.ts';
import { int, pick, rng, sample } from './seed.ts';

/** Demo-mode options (C2): `{"options":[{title, pitch, rationale}]}`. */
export function renderOptions(seed: number, subject: string, count = 6): { options: { title: string; pitch: string; rationale: string }[] } {
  const rand = rng(seed);
  const topic = titleFrom(subject, 'the problem').toLowerCase();
  const angles = [
    { title: 'The narrow wedge', pitch: `Solve one painful slice of ${topic} for one kind of person, and do it unusually well.`, rationale: 'A small, specific promise is easier to test and to explain.' },
    { title: 'The service first', pitch: `Do ${topic} by hand for ten people before building anything.`, rationale: 'You learn what matters before you pay to automate it.' },
    { title: 'The partner route', pitch: `Reach people through someone they already trust for ${topic}.`, rationale: 'Borrowed trust shortens the slowest part of adoption.' },
    { title: 'The contrarian bet', pitch: `Take the option everyone in ${topic} avoids and make its downside the selling point.`, rationale: 'Crowded defaults leave room at the edges.' },
    { title: 'The slow build', pitch: `Publish what you learn about ${topic} every week and let an audience form around it.`, rationale: 'Compounding attention costs time, not money.' },
    { title: 'The bundle', pitch: `Combine ${topic} with the step people do right before or after it.`, rationale: 'Owning the handoff removes a common failure point.' },
    { title: 'The premium tier', pitch: `Offer a deliberately expensive, high-touch version of ${topic}.`, rationale: 'A high price filters for the customers with the sharpest need.' },
    { title: 'The open default', pitch: `Give away the core of ${topic} and charge for the hard parts.`, rationale: 'Free use builds reach; the hard parts carry the revenue.' },
  ];
  return { options: sample(rand, angles, Math.max(1, Math.min(count, angles.length))) };
}

/**
 * Demo-mode storyboard (C5): shots with image prompts and on-screen captions, a short voice-over, and the headline and
 * tagline (spec §3.3, contracts v5). The on-screen copy is what the late VOICE edits; the voice-over is locked after its
 * own script step, so the two are written apart.
 */
export function renderStoryboard(seed: number, subject: string): {
  storyboard: { shot: number; description: string; imagePrompt: string; durationSec: number; caption: string }[];
  voiceover: string;
  headline: string;
  tagline: string;
} {
  const rand = rng(seed);
  const topic = titleFrom(subject, 'the product').toLowerCase();
  const light = pick(rand, ['early morning light', 'warm late-afternoon light', 'soft overcast light', 'neon-lit evening']);
  const beats = [
    { description: 'Open on a small, everyday frustration.', imagePrompt: `Close-up of hands mid-task, ${light}, shallow depth of field`, caption: 'Again?' },
    { description: `Introduce ${topic} in use, without explanation.`, imagePrompt: `${topic} in a real setting, ${light}, natural colour`, caption: 'Meet the shortcut.' },
    { description: 'Show the moment it saves time.', imagePrompt: `Over-the-shoulder shot of a finished result, ${light}`, caption: 'Done before the kettle boils.' },
    { description: 'Cut to the person enjoying the time they got back.', imagePrompt: `Wide shot of a person outdoors, relaxed, ${light}`, caption: 'This is the time you got back.' },
    { description: 'Close on the name and one line.', imagePrompt: `Simple product shot on a plain background, ${light}, generous negative space`, caption: titleFrom(subject, 'The product') },
  ];
  const storyboard = beats.map((b, i) => ({ shot: i + 1, description: b.description, imagePrompt: b.imagePrompt, durationSec: int(rand, 3, 6), caption: b.caption }));
  return {
    storyboard,
    voiceover: `Some things should take less time. With ${topic}, they do. Spend it on something better.`,
    headline: pick(rand, ['Less waiting. More doing.', 'Time, handed back.', 'The slow part, gone.']),
    tagline: pick(rand, ['Made for the busy part of the day.', 'Small thing, big difference.', 'Built to get out of your way.']),
  };
}

/**
 * Demo-mode code change (C7): a small unified diff that removes a duplicated helper, then a "Why:" paragraph.
 * Hunk headers are computed from the lines, so the diff applies to the file it describes.
 */
export function renderDiff(seed: number, iteration = 0): string {
  const rand = rng(seed);
  const noun = pick(rand, ['invoice', 'session', 'upload', 'report', 'order', 'profile']);
  const file = `src/${noun}s/format.ts`;
  const Noun = noun[0]?.toUpperCase() + noun.slice(1);
  const context = [`import type { ${Noun} } from './types';`, ''];
  const removed = [
    `function pad${Noun}Id(id: number): string {`,
    `  return String(id).padStart(8, '0');`,
    `}`,
    ``,
    `export function format${Noun}(item: ${Noun}): string {`,
    `  const id = pad${Noun}Id(item.id);`,
    `  return id + ' ' + item.name.trim();`,
    `}`,
  ];
  const added = [`export function format${Noun}(item: ${Noun}): string {`, `  return \`\${String(item.id).padStart(8, '0')} \${item.name.trim()}\`;`, `}`];
  // Later fix turns trim further: drop the explicit return type the signature already implies.
  if (iteration > 0) added[0] = `export const format${Noun} = (item: ${Noun}) =>`;
  if (iteration > 0) added.splice(1, 2, `  \`\${String(item.id).padStart(8, '0')} \${item.name.trim()}\`;`);
  const oldCount = context.length + removed.length;
  const newCount = context.length + added.length;
  const lines = [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,${oldCount} +1,${newCount} @@`,
    ...context.map((l) => ` ${l}`),
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
  ];
  return [
    '```diff',
    ...lines,
    '```',
    '',
    `Why: the one-line helper was used once, so inlining it removes a name the reader has to look up and shortens format${Noun} without changing its output.`,
  ].join('\n');
}
