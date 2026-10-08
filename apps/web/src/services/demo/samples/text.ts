/**
 * Sample prose and option content for demo runs. Deterministic per problem, plausible, and plainly marked as
 * drafts where a real model would produce placeholder wording.
 */

export function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A short subject phrase from the problem, for sample copy ("my pottery studio in Lisbon"). */
export function subjectFrom(problem: string): string {
  const first = problem.trim().split(/(?<=[.!?])\s+|\n/)[0] ?? '';
  const subject = first
    .replace(/[.!?]+$/, '')
    .replace(/^(please\s+)?(i|we)\s+(need|want|would like)\s+(to\s+)?/i, '')
    .replace(/^(help me\s+)?(write|make|build|create|design|draft|polish|review|plan|tidy up)\s+/i, '')
    .replace(/^(a|an|the|my|our)\s+/i, '')
    .replace(/^(\d+[- ]second\s+)?(landing page|web page|website|homepage|memo|newsletter|blog post|post|cover letter|letter|short story|story|video ad|ad|pull request|essay|proposal|deck|names|ideas)\s+(for|about|on|to|series on)\s+/i, '')
    .trim();
  return (subject || first || 'your project').slice(0, 80);
}

/** Small deterministic hash for picking sample variations. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// --- Idea Generator (C2) ---------------------------------------------------------------------------------

const OPTION_PATTERNS: [string, (s: string) => string, string][] = [
  ['Start with the smallest version', (s) => `Ship one tiny, complete slice of ${s} to ten people this month.`, 'Cheap to test; learning comes fast.'],
  ['Borrow from another field', (s) => `Run ${s} the way a public library runs its lending desk.`, 'An outside model breaks the category habits.'],
  ['Invert the default', (s) => `Do the opposite of what everyone in ${s} does first.`, 'The default is where everyone already is.'],
  ['Make it a ritual', (s) => `Turn ${s} into something people do every week, at the same time.`, 'Habits outlast campaigns.'],
  ['Charge for the outcome', (s) => `Price ${s} on the result people get, not on the hours.`, 'Aligns the offer with what people value.'],
  ['Work in public', (s) => `Build ${s} in the open and publish every decision as you make it.`, 'Trust grows from visible reasoning.'],
  ['Remove a step', (s) => `Find the step in ${s} that people resent most, and delete it.`, 'Subtraction is rarely tried first.'],
  ['Partner instead of build', (s) => `Find the group already doing half of ${s} and join them.`, 'Distribution beats duplication.'],
];

export function optionCards(subject: string): { title: string; pitch: string; rationale: string }[] {
  return OPTION_PATTERNS.map(([title, pitch, rationale]) => ({ title, pitch: pitch(subject), rationale }));
}

export function optionCardMarkdown(o: { title: string; pitch: string; rationale: string }, note?: string): string {
  return `### ${o.title}\n\n${o.pitch}\n\n*Why it might work:* ${o.rationale}${note ? `\n\n> ${note}` : ''}\n`;
}

// --- Series Writer (C3) and Ad Video Chain (C5) angle and territory cards -------------------------------------

const ANGLES = [
  ['The mistake I keep seeing', 'Open with one specific, common error and what it costs.'],
  ['What changed my mind', 'A belief you held, the moment it broke, what replaced it.'],
  ['The boring part nobody writes about', 'The unglamorous work that decides the outcome.'],
  ['A number that surprised me', 'One figure from your own work, and what it implies.'],
  ['Advice I would give my younger self', 'Three concrete things, each with a story.'],
  ['Against the consensus', 'Argue with a popular idea in your field, fairly.'],
];

export function angleCards(subject: string): string[] {
  return ANGLES.map(([title, body]) => `### ${title}\n\n${body} Applied to ${subject}.\n`);
}

const TERRITORIES = [
  ['Hands at work', 'Close-ups of the product in use, no faces, natural sound.'],
  ['One long take', 'A single unbroken shot that follows the product through a day.'],
  ['Before the start', 'The quiet minute before the moment the product is for.'],
  ['Object portrait', 'The product alone, lit like a museum piece, slow turn.'],
];

export function territoryCards(subject: string): string[] {
  return TERRITORIES.map(([title, body]) => `### ${title}\n\n${body} For ${subject}.\n`);
}

// --- Fiction Second Reader (C6a) ------------------------------------------------------------------------------

const PREMISES = [
  ['A list of things left behind', 'Told as the inventory a landlord makes after a tenant vanishes.', 'Second person, reverse chronology', 'A blue enamel kettle', 'Dry'],
  ['The last night shift', 'A tollbooth worker on the night the booth is automated.', 'Close third, one location', 'Headlights crossing the ceiling', 'Tender'],
  ['Letters never sent', 'A sister writes to a brother who stopped answering in 1994.', 'Epistolary', 'A torn ferry ticket', 'Dread'],
  ['The weather report', 'A town where the forecast is always exactly right, until it is not.', 'First person plural', 'A barometer in the post office', 'Wry'],
  ['Two kitchens', 'The same dinner cooked forty years apart, braided.', 'Braided timelines', 'Burnt sugar', 'Warm'],
  ['The understudy', 'An understudy waits every night for a lead who is never ill.', 'Close third, no dialogue tags', 'A costume that almost fits', 'Restless'],
];

export function premiseCards(): string[] {
  return PREMISES.map(
    ([title, premise, form, image, temp]) =>
      `### ${title}\n\n**Premise:** ${premise}\n\n**Form:** ${form}  \n**Central image:** ${image}  \n**Temperature:** ${temp}\n`,
  );
}

// --- Memo Polish (C4) and Series Writer (C3) drafts ------------------------------------------------------------

export function memoDraft(subject: string, ask: string): string {
  return `# ${cap(subject)}

**Bottom line:** ${ask || `We need a decision on ${subject} by Friday.`}

## Context

In today's fast-paced environment, it is important to note that our current approach has served us well, but there are opportunities to leverage new ways of working.

## Options

1. **Keep the current plan.** No extra cost; the known issues remain.
2. **Move to the cheaper option.** Saves roughly a fifth of the budget; needs two weeks of setup.
3. **Split the difference.** Pilot the cheaper option with one team first.

## Recommendation

Option 3. It limits the risk while we learn what the change really costs.

## Next steps

- Agree the pilot team by Wednesday.
- Review the pilot after four weeks.

Let me know if you have any questions or concerns.
`;
}

export function trimMemo(text: string): string {
  return text.replace(/## Context\n\n[^\n]*\n\n/, '').replace(/\nLet me know if you have any questions or concerns\.\n?$/, '\n');
}

export function sweepMemo(text: string): string {
  return text
    .replace(/In today's fast-paced environment, it is important to note that /g, '')
    .replace(/leverage new ways of working/g, 'change how we work')
    .replace(/Let me know if you have any questions or concerns\./g, 'Reply by Wednesday if you disagree.');
}

export function seriesDraft(subject: string, angle: string, thesis: string): string {
  return `# ${angle}

*${thesis || `A thesis about ${subject}, in your words.`}*

In the ever-evolving landscape of ${subject}, one thing is clear: the details matter more than we think.

## Where it goes wrong

Most people start with the tools. They should start with the problem. [Your example here: a specific moment from your own work.]

## What to do instead

1. Name the outcome before choosing the method.
2. Make the smallest version first, and show it to someone.
3. Write down what you learned, even when it is unflattering.

## The takeaway

At the end of the day, it is not about doing more. It is about doing what matters.
`;
}

export function trimSeries(text: string): string {
  return text.replace(/\n## The takeaway\n\n[^\n]*\n?/, '\n');
}

export function sweepSeries(text: string): string {
  return text
    .replace(/In the ever-evolving landscape of ([^,]+), one thing is clear: /g, 'In $1, ')
    .replace(/At the end of the day, it is not about doing more\. It is about doing what matters\./g, 'Do less, and finish it.');
}

// --- Second Reader (C6, C6a) annotations ----------------------------------------------------------------------

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function trimMarks(text: string): string {
  const longest = [...sentences(text)].sort((a, b) => b.length - a.length).slice(0, 2);
  if (longest.length === 0) return '## Trim marks\n\nNothing to mark yet: the draft is empty.\n';
  return `## Trim marks\n\nThese only point; nothing has been deleted.\n\n${longest.map((s) => `- Could go or be split: "${s.slice(0, 120)}${s.length > 120 ? '…' : ''}"`).join('\n')}\n`;
}

const FORMULA = [
  [/\bI am (?:very )?passionate about\b/i, '"I am passionate about" announces a feeling instead of showing it.'],
  [/\btrack record\b/i, '"track record" phrasing reads as a template; name the record.'],
  [/\bteam player\b/i, '"team player" is a listed credential; tell the moment instead.'],
  [/\bin conclusion\b/i, '"In conclusion" announces the structure.'],
  [/\bsuddenly\b/i, '"Suddenly" often stands in for a scene that was not built.'],
  [/\bfelt a wave of\b/i, '"felt a wave of" names the emotion; show what the character does.'],
] as const;

export function clicheFlags(text: string, fiction: boolean): string {
  const hits = FORMULA.filter(([re]) => re.test(text)).map(([, why]) => `- ${why}`);
  const generic = fiction
    ? '- Check names: stock names (Elara, Kael, Marcus) read as generated.'
    : '- Check the opening: does it echo the job posting back?';
  return `## Cliché flags\n\nFlags only; you decide what stays.\n\n${[...hits, generic].join('\n')}\n`;
}

/**
 * The outside critique's notes on your text. With at least three examples it ranks against them (GREAT mode);
 * with fewer it scores against the quality bar instead (OK mode, ADR-0071), and says which it did.
 */
export function critiqueRank(text: string, fiction: boolean, refs: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const rank = words > 250 ? 2 : words > 80 ? 3 : 4;
  const kind = fiction ? 'passages you admire' : 'examples you admire';
  const verdict = refs >= 3 ? `Ranked **${Math.min(rank, refs + 1)} of ${refs + 1}** against the ${refs} ${kind}.` : `Scored **${9 - rank}/10** against the quality bar.`;
  return `## Outside critique\n\n${verdict}\n\nTop three weaknesses:\n\n1. The opening takes too long to reach the specific detail that makes it yours.\n2. One paragraph restates the one before it.\n3. The ending summarises instead of landing on an image or an ask.\n`;
}
