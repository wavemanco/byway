import { titleFrom } from './extract.ts';
import { pick, rng, sample } from './seed.ts';

/**
 * Demo-mode Markdown: an internal memo (C4) when the problem reads like one, a short scene for fiction (C6a), and a
 * short essay otherwise (C3, C6). Plausible, plain and short: sample text, not filler pretending to be finished work.
 */

const MEMO = /\b(memo|update|status|rca|root cause|incident|prd|proposal|plan|report|brief|email|summary|decision|retro)/i;
const FICTION = /\b(story|fiction|novel|chapter|scene|character|short story|serial|script|screenplay)/i;

export type ProseKind = 'memo' | 'fiction' | 'essay';

export function proseKind(subject: string): ProseKind {
  if (FICTION.test(subject)) return 'fiction';
  if (MEMO.test(subject)) return 'memo';
  return 'essay';
}

export function renderProse(seed: number, subject: string): string {
  const rand = rng(seed);
  const kind = proseKind(subject);
  const title = titleFrom(subject, 'A short note');
  if (kind === 'memo') {
    const ask = pick(rand, ['Approve the two-week pilot by Friday.', 'Pick option B so the team can start Monday.', 'Confirm the revised launch date of the 24th.', 'Agree to pause the migration until the fix ships.']);
    const risks = sample(rand, ['The estimate assumes no new requests land mid-sprint.', 'Two people carry most of the context; we will pair them with others this week.', 'Support volume may rise for a few days after the change.', 'The vendor contract renews in six weeks, so the clock is real.'], 2);
    return [
      `# ${title}`,
      '',
      `**Ask:** ${ask}`,
      '',
      `**Bottom line:** we can do this with the people we have, and the cost of waiting is higher than the cost of trying.`,
      '',
      '## Context',
      '',
      `This covers ${subject.charAt(0).toLowerCase()}${subject.slice(1).replace(/[.?!]$/, '')}. The short version: the current approach works, but it costs us about a day a week in rework, and that number is growing.`,
      '',
      '## What we propose',
      '',
      '- Run a two-week pilot with one team and measure rework hours before and after.',
      '- Keep the current process in place for everyone else until the pilot reports.',
      '- Decide on the 30th, with the numbers in hand.',
      '',
      '## Risks',
      '',
      ...risks.map((r) => `- ${r}`),
      '',
      '## Next steps',
      '',
      'If you approve, the pilot starts Monday and the first numbers arrive the following Friday.',
      '',
    ].join('\n');
  }
  if (kind === 'fiction') {
    const name = pick(rand, ['Ada', 'Tomas', 'Wren', 'Ilse', 'Marek', 'Noor']);
    const place = pick(rand, ['the ferry terminal', 'her aunt’s bakery', 'the night shift at the depot', 'a borrowed flat above the market']);
    const object = pick(rand, ['a key that fit nothing', 'an unsigned postcard', 'a coat two sizes too big', 'a jar of buttons']);
    return [
      `# ${title}`,
      '',
      `${name} found ${object} on the first morning at ${place}. It was not the kind of thing anyone loses by accident.`,
      '',
      `She put it in her pocket and kept working, because the work did not stop for small mysteries. By noon it had grown heavier, the way a question does when nobody else seems to be asking it.`,
      '',
      `"You kept it," said the woman at the counter, not looking up. It was not a question either.`,
      '',
      `${name} thought about lying. Instead she set it on the counter between them and waited to see who would speak first.`,
      '',
    ].join('\n');
  }
  const opening = pick(rand, [
    'Most advice on this starts in the wrong place.',
    'The first version of anything is a guess. The trick is making it a useful guess.',
    'There is a quieter way to think about this, and it starts with what you already know.',
  ]);
  return [
    `# ${title}`,
    '',
    `${opening} It starts with the goal and works backwards from the result you want, not forwards from the tools you have.`,
    '',
    '## Start with the reader',
    '',
    'Ask what the reader needs to do after reading. Everything that does not help them do it is a candidate for cutting.',
    '',
    '## Say the hard part plainly',
    '',
    'The useful sentence is usually the one you were tempted to soften. Keep it, and give the reason in the next line.',
    '',
    '## End where they act',
    '',
    'Finish with the next step, who takes it and by when. A clear ending is worth more than a clever one.',
    '',
  ].join('\n');
}

const FILLER = /\b(very|really|just|quite|basically|actually|in order to)\s+/gi;

/** A worker's revision in demo mode: the same document with filler words trimmed. */
export function reviseProse(markdown: string): string {
  return markdown.replace(FILLER, (m) => (/^in order to/i.test(m) ? 'to ' : '')).replace(/[ \t]{2,}/g, ' ');
}
