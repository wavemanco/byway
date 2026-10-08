/**
 * Demo scripts for the eight recipes. Together they open every checkpoint kind (pick, react, confirm,
 * compare, directive, write, choose) so every "Your turn" panel can be exercised without keys. Costs are
 * sample figures in the range of each recipe's estimate.
 */
import type { CheckpointResolution } from '@byway/contracts';
import { DIFF_IMPLEMENT, DIFF_REVIEWED, DIFF_SCOPED, DIFF_SWEPT, WHY_DRAFT } from './samples/code.ts';
import { frameSvg, shotsFor, voiceoverDraft } from './samples/media.ts';
import { BRANDS, PAGE_STYLES, STYLE_NAMES, aiCopy, copyToText, renderPage, sweptCopy, textToCopy, type PageCopy } from './samples/pages.ts';
import {
  angleCards,
  cap,
  clicheFlags,
  critiqueRank,
  memoDraft,
  optionCardMarkdown,
  optionCards,
  premiseCards,
  seriesDraft,
  sweepMemo,
  sweepSeries,
  territoryCards,
  trimMarks,
  trimMemo,
  trimSeries,
} from './samples/text.ts';
import type { DemoContext, Produced, Script, ScriptStep } from './script.ts';

const HTML = 'text/html';
const MD = 'text/markdown';
const JSON_TYPE = 'application/json';
const DIFF = 'text/x-diff';
const SVG = 'image/svg+xml';

type StepInput = Omit<ScriptStep, 'who'>;
const ai = (s: StepInput): ScriptStep => ({ who: 'ai', ...s });
const you = (s: StepInput): ScriptStep => ({ who: 'you', ...s });
const tool = (s: StepInput): ScriptStep => ({ who: 'tool', ...s });

async function produce(ctx: DemoContext, text: string, mediaType: string, extra: Omit<Produced, 'artifactId' | 'mediaType'> = {}): Promise<Produced> {
  return { artifactId: await ctx.put(text, mediaType), mediaType, ...extra };
}

function attachment(ctx: DemoContext): string | undefined {
  const text = ctx.problem.attachments?.map((a) => a.text.trim()).filter(Boolean).join('\n\n');
  return text || undefined;
}

function title(card: string): string {
  return /^###\s+(.+)$/m.exec(card)?.[1]?.trim() ?? 'Option';
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`demo script is missing ${what}`);
  return value;
}

const chosenIndex = (res: CheckpointResolution, ids: string[]): number[] =>
  (res.choice ?? []).map((id) => ids.indexOf(id)).filter((i) => i >= 0);

/** Cards as pick options: each card is its own artifact so the contact sheet can show it. */
async function putCards(ctx: DemoContext, cards: string[]): Promise<Produced[]> {
  ctx.state.cards = cards;
  const produced = await Promise.all(cards.map((c, i) => produce(ctx, c, MD, { label: title(c), candidate: i })));
  ctx.state.cardIds = produced.map((p) => p.artifactId);
  return produced;
}

function cardOptions(ctx: DemoContext) {
  const ids = need(ctx.state.cardIds, 'cards');
  return ids.map((artifactId, i) => ({ id: `card-${i + 1}`, label: title(ctx.state.cards?.[i] ?? ''), artifactId }));
}

function pickCards(ctx: DemoContext, res: CheckpointResolution): void {
  ctx.state.chosen = chosenIndex(res, cardOptions(ctx).map((o) => o.id));
}

/** The cliché sweep's keep-or-revert question, shared by every recipe that has one. */
const compareStep = (stage: 'D3', mediaLabel: string): ScriptStep =>
  you({
    id: 'tells-compare',
    stage,
    label: 'Keep or revert',
    role: 'tells-compare',
    block: 'TELLS',
    ask: async (ctx) => ({
      kind: 'compare',
      prompt: `Keep the cliché swaps, or go back to the ${mediaLabel} before them?`,
      options: [
        { id: 'A', label: 'Before the swaps', artifactId: need(ctx.state.before, 'before') },
        { id: 'B', label: 'After the swaps', artifactId: need(ctx.state.after, 'after') },
      ],
    }),
    apply: (ctx, res) => {
      const keepSwaps = res.choice?.[0] !== 'A';
      ctx.state.current = keepSwaps ? ctx.state.after : ctx.state.before;
      if (keepSwaps && ctx.state.afterText !== undefined) ctx.state.text = ctx.state.afterText;
      if (keepSwaps && ctx.state.page) ctx.state.page.copy = sweptCopy(ctx.state.page.copy, ctx.subject);
    },
  });

const trimAsk = (prompt: string): ScriptStep['ask'] => async (ctx) => ({
  kind: 'directive',
  prompt,
  artifactIds: ctx.state.current ? [ctx.state.current] : [],
});

// --- C1 Landing Page Studio ------------------------------------------------------------------------------------

function pageHtml(ctx: DemoContext, i: number, copy: PageCopy, imagery: boolean): string {
  const style = PAGE_STYLES[i] ?? 'signal';
  return renderPage(style, BRANDS[style], copy, { imagery });
}

async function draftSet(ctx: DemoContext, imagery: boolean): Promise<Produced[]> {
  const copies = need(ctx.state.copies, 'copies');
  const produced = await Promise.all(
    PAGE_STYLES.map((style, i) => produce(ctx, pageHtml(ctx, i, copies[i] ?? aiCopy(ctx.subject, style), imagery), HTML, { label: STYLE_NAMES[style], candidate: i })),
  );
  ctx.state.drafts = produced.map((p) => p.artifactId);
  return produced;
}

async function currentPage(ctx: DemoContext, label: string): Promise<Produced> {
  const page = need(ctx.state.page, 'page');
  const html = renderPage(page.style, page.brand, page.copy, { imagery: ctx.state.imagery === true, trimmed: page.trimmed });
  const p = await produce(ctx, html, HTML, { label });
  ctx.state.current = p.artifactId;
  return p;
}

const c1: Script = {
  recipeId: 'c1',
  family: 'C1',
  title: 'Landing Page Studio',
  medium: 'web-page',
  steps: [
    you({
      id: 'entry',
      stage: 'D1',
      label: 'How to start',
      role: 'select',
      when: (ctx) => !ctx.routes.entry,
      ask: async () => ({
        kind: 'choose',
        prompt: 'How do you want to start?',
        options: [
          { id: 'seed', label: 'Random spark: four drafts from four random starting points' },
          { id: 'vision-direct', label: 'Your direction: describe the look you want first' },
        ],
      }),
      apply: (ctx, res) => {
        ctx.state.entry = res.choice?.[0];
      },
    }),
    you({
      id: 'vision',
      stage: 'D1',
      label: 'Your direction',
      role: 'vision',
      block: 'VISION',
      when: (ctx) => (ctx.state.entry ?? ctx.routes.entry) === 'vision-direct',
      ask: async () => ({
        kind: 'react',
        prompt: 'Describe the direction: a reference you like, a feeling, a look. AI drafts four takes on it.',
      }),
      apply: (ctx, res) => {
        ctx.state.direction = res.text;
      },
    }),
    ai({
      id: 'seed-build',
      stage: 'D1',
      label: 'Random spark',
      role: 'seed',
      block: 'SEED',
      costUsd: 0.24,
      units: 4,
      work: async (ctx) => {
        ctx.state.copies = PAGE_STYLES.map((s) => aiCopy(ctx.subject, s));
        return draftSet(ctx, false);
      },
    }),
    ai({
      id: 'critic-loop',
      stage: 'D2',
      label: 'Outside critique',
      role: 'critic',
      block: 'CRITIC',
      costUsd: 0.42,
      units: 3,
      iterations: 3,
      note: () => 'Each draft went through 3 rounds of notes and fixes.',
      work: async (ctx) => {
        ctx.state.copies = need(ctx.state.copies, 'copies').map((c) => ({
          ...c,
          points: [c.points[0] ?? ['', ''], c.points[1] ?? ['', ''], ['Close by', 'Made, answered and fixed by people a short walk from you.']],
        }));
        return draftSet(ctx, false);
      },
    }),
    you({
      id: 'plain',
      stage: 'D2',
      label: 'Plain?',
      role: 'vision',
      block: 'ASSET',
      ask: async (ctx) => ({
        kind: 'confirm',
        prompt: 'Do any of these drafts look plain? Say yes and AI makes custom imagery for them.',
        artifactIds: need(ctx.state.drafts, 'drafts'),
      }),
      apply: (ctx, res) => {
        ctx.state.imagery = res.approved === true;
      },
    }),
    ai({
      id: 'asset',
      stage: 'D2',
      label: 'Custom imagery',
      role: 'asset',
      block: 'ASSET',
      costUsd: 0.16,
      units: 2,
      when: (ctx) => (ctx.state.imagery ? true : 'You did not find the drafts plain.'),
      work: (ctx) => draftSet(ctx, true),
    }),
    you({
      id: 'pick-one',
      stage: 'D2',
      label: 'Your pick',
      role: 'select',
      ask: async (ctx) => ({
        kind: 'pick',
        prompt: 'Pick the draft to finish. The others are set aside.',
        k: 1,
        options: need(ctx.state.drafts, 'drafts').map((artifactId, i) => ({ id: `draft-${i + 1}`, label: STYLE_NAMES[PAGE_STYLES[i] ?? 'signal'], artifactId })),
      }),
      apply: (ctx, res) => {
        const i = Math.max(0, Number(res.choice?.[0]?.replace('draft-', '') ?? 1) - 1);
        const style = PAGE_STYLES[i] ?? 'signal';
        ctx.state.page = { style, brand: BRANDS[style], copy: need(ctx.state.copies, 'copies')[i] ?? aiCopy(ctx.subject, style), trimmed: false };
        ctx.state.current = ctx.state.drafts?.[i];
      },
    }),
    you({
      id: 'cut',
      stage: 'D3',
      label: 'Trim',
      role: 'cut',
      block: 'CUT',
      ask: trimAsk('List what to remove from the page, one item per line. AI removes exactly that and nothing else.'),
    }),
    ai({
      id: 'apply-cut',
      stage: 'D3',
      label: 'Apply trim',
      role: 'fix',
      block: 'CUT',
      costUsd: 0.04,
      work: async (ctx) => {
        need(ctx.state.page, 'page').trimmed = true;
        return [await currentPage(ctx, 'Trimmed')];
      },
    }),
    ai({
      id: 'tells-sweep',
      stage: 'D3',
      label: 'Cliché sweep',
      role: 'tells-sweep',
      block: 'TELLS',
      costUsd: 0.05,
      units: 2,
      note: () => '3 stock patterns flagged, with swaps proposed.',
      work: async (ctx) => {
        const page = need(ctx.state.page, 'page');
        ctx.state.before = ctx.state.current;
        const hits = await produce(
          ctx,
          `## Cliché sweep\n\n- **Headline:** "${page.copy.headline}" is a stock opener. Swap: say plainly what it is.\n- **Subhead:** "Seamless, effortless" is filler. Swap: what it is, who it is for, what happens next.\n- **Point 1:** "Crafted with care" claims care instead of showing it. Swap: name the one thing people come for.\n`,
          MD,
          { label: 'Flags' },
        );
        const swapped = renderPage(page.style, page.brand, sweptCopy(page.copy, ctx.subject), { imagery: ctx.state.imagery === true, trimmed: page.trimmed });
        const after = await produce(ctx, swapped, HTML, { label: 'With swaps' });
        ctx.state.after = after.artifactId;
        return [hits, after];
      },
    }),
    compareStep('D3', 'page'),
    you({
      id: 'voice',
      stage: 'D3',
      label: 'Your words',
      role: 'voice',
      block: 'VOICE',
      ask: async (ctx) => {
        const page = need(ctx.state.page, 'page');
        return {
          kind: 'write',
          prompt: 'Rewrite every line in your own words. Keep one field per line; AI changes only the text on the page.',
          initialText: copyToText(page.copy, page.trimmed),
          artifactIds: ctx.state.current ? [ctx.state.current] : [],
        };
      },
      apply: (ctx, res) => {
        const page = need(ctx.state.page, 'page');
        page.copy = textToCopy(res.text ?? '', page.copy);
      },
    }),
    ai({
      id: 'voice-apply',
      stage: 'D3',
      label: 'Set your words',
      role: 'fix',
      block: 'VOICE',
      costUsd: 0.03,
      work: async (ctx) => [await currentPage(ctx, 'Your words')],
    }),
    ai({
      id: 'critic-check',
      stage: 'D3',
      label: 'Final check',
      role: 'check',
      block: 'CRITIC',
      costUsd: 0.02,
      note: () => 'No defects found.',
    }),
  ],
  finish: async (ctx) => need(ctx.state.current, 'page'),
};

// --- C2 Idea Generator -----------------------------------------------------------------------------------------

const c2: Script = {
  recipeId: 'c2',
  family: 'C2',
  title: 'Idea Generator',
  medium: 'options',
  steps: [
    ai({
      id: 'seed-options',
      stage: 'D1',
      label: 'Random spark',
      role: 'seed',
      block: 'SEED',
      costUsd: 0.08,
      units: 3,
      work: (ctx) => putCards(ctx, optionCards(ctx.subject).map((o) => optionCardMarkdown(o))),
    }),
    tool({
      id: 'dedupe',
      stage: 'D1',
      label: 'Remove near-duplicates',
      role: 'select',
      glue: 'dedupe',
      note: () => 'Removed 2 near-duplicates; 6 options remain.',
      work: async (ctx) => {
        ctx.state.cards = need(ctx.state.cards, 'cards').slice(0, 6);
        ctx.state.cardIds = need(ctx.state.cardIds, 'card ids').slice(0, 6);
        return [];
      },
    }),
    ai({
      id: 'vanilla-overlap',
      stage: 'D1',
      label: 'Obvious-idea check',
      role: 'judge',
      costUsd: 0.03,
      note: () => 'A plain prompt also suggested "Start with the smallest version". It is flagged, not removed.',
      work: async (ctx) => {
        const options = optionCards(ctx.subject);
        const first = options[0];
        if (!first) return [];
        const flagged = await produce(ctx, optionCardMarkdown(first, 'A plain prompt also suggests this one.'), MD, { label: first.title, candidate: 0 });
        need(ctx.state.cardIds, 'card ids')[0] = flagged.artifactId;
        return [flagged];
      },
    }),
    ai({
      id: 'annotate',
      stage: 'D1',
      label: 'Outside critique',
      role: 'critic',
      block: 'CRITIC',
      costUsd: 0.04,
      work: async (ctx) => [
        await produce(
          ctx,
          `## Advisory notes\n\nNothing is removed on these notes.\n\n${need(ctx.state.cards, 'cards')
            .map((c, i) => `- **${title(c)}:** ${['cheapest to try', 'needs a partner to work', 'risky but distinctive', 'slow to show results', 'hard to price', 'strong if you can stay consistent'][i] ?? 'worth a look'}.`)
            .join('\n')}\n`,
          MD,
          { label: 'Notes' },
        ),
      ],
    }),
    you({
      id: 'pick-options',
      stage: 'D1',
      label: 'Your pick',
      role: 'select',
      ask: async (ctx) => ({
        kind: 'pick',
        prompt: 'Choose the three options worth keeping. The notes are advisory; nothing was removed on their say-so.',
        k: 3,
        options: cardOptions(ctx),
      }),
      apply: pickCards,
    }),
    you({
      id: 'sharpen',
      stage: 'D1',
      label: 'Your direction',
      role: 'vision',
      block: 'VISION',
      ask: async (ctx) => ({
        kind: 'react',
        prompt: 'What draws you to these three? Say what to keep, what to drop and what is missing; byway sharpens it into a brief.',
        artifactIds: (ctx.state.chosen ?? []).map((i) => ctx.state.cardIds?.[i]).filter((id): id is string => Boolean(id)),
      }),
      apply: (ctx, res) => {
        ctx.state.direction = res.text;
      },
    }),
    ai({
      id: 'brief',
      stage: 'D1',
      label: 'Brief',
      role: 'build',
      block: 'VISION',
      costUsd: 0.03,
      work: async (ctx) => [
        await produce(ctx, `## Brief\n\n**Your reaction:** ${ctx.state.direction ?? ''}\n\n**Direction:** keep what you named, drop the rest, and test the smallest version first.\n`, MD, { label: 'Brief' }),
      ],
    }),
    you({
      id: 'voice',
      stage: 'D1',
      label: 'Your words',
      role: 'voice',
      block: 'VOICE',
      ask: async (ctx) => {
        const first = optionCards(ctx.subject)[ctx.state.chosen?.[0] ?? 0];
        return {
          kind: 'write',
          prompt: 'Name the direction and write its one-line pitch, in your words.',
          initialText: `Name: ${first?.title ?? ''}\nPitch: ${first?.pitch ?? ''}`,
        };
      },
      apply: (ctx, res) => {
        ctx.state.text = res.text;
      },
    }),
  ],
  finish: async (ctx) => {
    const all = optionCards(ctx.subject);
    const chosen = (ctx.state.chosen?.length ? ctx.state.chosen : [0, 1, 2]).map((i) => all[i]).filter((o) => o !== undefined);
    const fields = new Map((ctx.state.text ?? '').split(/\r?\n/).map((l) => [l.split(':')[0]?.trim().toLowerCase() ?? '', l.slice(l.indexOf(':') + 1).trim()]));
    const options = chosen.map((o, i) =>
      i === 0 ? { title: fields.get('name') || o.title, pitch: fields.get('pitch') || o.pitch, rationale: o.rationale } : o,
    );
    return ctx.put(JSON.stringify({ options }, null, 2), JSON_TYPE);
  },
};

// --- Text recipes: C3 Series Writer and C4 Memo Polish ------------------------------------------------------------

function textVersion(label: string, transform: (text: string) => string, costUsd: number, role: ScriptStep['role'], block?: ScriptStep['block']): Omit<StepInput, 'id' | 'stage'> {
  return {
    label,
    role,
    ...(block ? { block } : {}),
    costUsd,
    work: async (ctx) => {
      ctx.state.text = transform(need(ctx.state.text, 'text'));
      const p = await produce(ctx, ctx.state.text, MD, { label });
      ctx.state.current = p.artifactId;
      return [p];
    },
  };
}

function sweepStep(sweep: (t: string) => string, hits: string): ScriptStep {
  return ai({
    id: 'tells-sweep',
    stage: 'D3',
    label: 'Cliché sweep',
    role: 'tells-sweep',
    block: 'TELLS',
    costUsd: 0.03,
    units: 2,
    work: async (ctx) => {
      ctx.state.before = ctx.state.current;
      ctx.state.afterText = sweep(need(ctx.state.text, 'text'));
      const flags = await produce(ctx, hits, MD, { label: 'Flags' });
      const after = await produce(ctx, ctx.state.afterText, MD, { label: 'With swaps' });
      ctx.state.after = after.artifactId;
      return [flags, after];
    },
  });
}

const voiceStep = (prompt: string): ScriptStep =>
  you({
    id: 'voice',
    stage: 'D3',
    label: 'Your words',
    role: 'voice',
    block: 'VOICE',
    ask: async (ctx) => ({ kind: 'write', prompt, initialText: ctx.state.text ?? '' }),
    apply: (ctx, res) => {
      ctx.state.text = res.text ?? ctx.state.text;
    },
  });

const finishText = async (ctx: DemoContext) => ctx.put(need(ctx.state.text, 'text'), MD);

const c3: Script = {
  recipeId: 'c3',
  family: 'C3',
  title: 'Series Writer',
  medium: 'prose',
  steps: [
    ai({ id: 'seed-angles', stage: 'D1', label: 'Random spark', role: 'seed', block: 'SEED', costUsd: 0.06, units: 3, work: (ctx) => putCards(ctx, angleCards(ctx.subject)) }),
    ai({
      id: 'vanilla-overlap',
      stage: 'D1',
      label: 'Obvious-idea check',
      role: 'judge',
      costUsd: 0.02,
      note: () => 'A plain prompt also wrote "Advice I would give my younger self". It is flagged, not removed.',
    }),
    you({
      id: 'pick-angle',
      stage: 'D1',
      label: 'Your pick',
      role: 'select',
      ask: async (ctx) => ({ kind: 'pick', prompt: 'Choose the angle for this piece.', k: 1, options: cardOptions(ctx) }),
      apply: pickCards,
    }),
    you({
      id: 'thesis',
      stage: 'D1',
      label: 'Your direction',
      role: 'vision',
      block: 'VISION',
      ask: async () => ({ kind: 'react', prompt: 'State your thesis in a sentence or two, from your own experience or data. The draft is built around it.' }),
      apply: (ctx, res) => {
        ctx.state.direction = res.text;
      },
    }),
    ai({
      id: 'draft',
      stage: 'D2',
      label: 'Draft',
      role: 'build',
      costUsd: 0.05,
      units: 2,
      work: async (ctx) => {
        const angle = title(ctx.state.cards?.[ctx.state.chosen?.[0] ?? 0] ?? '');
        ctx.state.text = attachment(ctx) ?? seriesDraft(ctx.subject, angle, ctx.state.direction ?? '');
        const p = await produce(ctx, ctx.state.text, MD, { label: 'Draft' });
        ctx.state.current = p.artifactId;
        return [p];
      },
    }),
    ai({
      id: 'critic-loop',
      stage: 'D2',
      iterations: 2,
      units: 2,
      note: () => 'In the top 3 of 10 after 2 rounds.',
      ...textVersion('Outside critique', (t) => t.replace('[Your example here: a specific moment from your own work.]', '[Your example here: the moment you noticed this in your own work.]'), 0.12, 'critic', 'CRITIC'),
    }),
    you({ id: 'cut', stage: 'D3', label: 'Trim', role: 'cut', block: 'CUT', ask: trimAsk('List what to cut, one item per line. AI cuts exactly that.') }),
    ai({ id: 'apply-cut', stage: 'D3', ...textVersion('Apply trim', trimSeries, 0.02, 'fix', 'CUT') }),
    sweepStep(sweepSeries, '## Cliché sweep\n\n- **Opening:** "In the ever-evolving landscape of" is a stock opener.\n- **Ending:** "At the end of the day" summarises instead of landing.\n'),
    compareStep('D3', 'draft'),
    voiceStep('Rewrite every line in your own words. The draft’s wording was a placeholder.'),
  ],
  finish: finishText,
};

const c4: Script = {
  recipeId: 'c4',
  family: 'C4',
  title: 'Memo Polish',
  medium: 'prose',
  steps: [
    you({
      id: 'vision',
      stage: 'D1',
      label: 'Your direction',
      role: 'vision',
      block: 'VISION',
      ask: async () => ({ kind: 'react', prompt: 'In a line or two: the decision or ask, and the one point the reader must get.' }),
      apply: (ctx, res) => {
        ctx.state.direction = res.text;
      },
    }),
    ai({
      id: 'draft',
      stage: 'D2',
      label: 'Draft',
      role: 'build',
      costUsd: 0.02,
      work: async (ctx) => {
        ctx.state.text = attachment(ctx) ?? memoDraft(ctx.subject, ctx.state.direction?.trim() ?? '');
        const p = await produce(ctx, ctx.state.text, MD, { label: 'Draft' });
        ctx.state.current = p.artifactId;
        return [p];
      },
    }),
    ai({
      id: 'critic',
      stage: 'D2',
      when: (ctx) => ((ctx.state.text ?? '').split(/\s+/).length > 300 ? true : 'Under 300 words, so your own read is enough.'),
      ...textVersion('Outside critique', (t) => t, 0.04, 'critic', 'CRITIC'),
    }),
    you({ id: 'cut', stage: 'D3', label: 'Trim', role: 'cut', block: 'CUT', ask: trimAsk('Cut to a length budget. List what the reader would not miss, one item per line.') }),
    ai({ id: 'apply-cut', stage: 'D3', ...textVersion('Apply trim', trimMemo, 0.01, 'fix', 'CUT') }),
    sweepStep(sweepMemo, '## Cliché sweep\n\n- **Context:** "In today\'s fast-paced environment" is filler.\n- **Context:** "leverage new ways of working" says nothing specific.\n- **Sign-off:** "Let me know if you have any questions" adds no ask.\n'),
    compareStep('D3', 'memo'),
    voiceStep('Read every line. Rewrite the bottom line, the ask, judgment calls and the sign-off in your own words.'),
  ],
  finish: finishText,
};

// --- C5 Ad Video Chain -------------------------------------------------------------------------------------------

const c5: Script = {
  recipeId: 'c5',
  family: 'C5',
  title: 'Ad Video Chain',
  medium: 'media',
  steps: [
    ai({ id: 'territories', stage: 'D1', label: 'Random spark', role: 'seed', block: 'SEED', costUsd: 0.06, units: 2, work: (ctx) => putCards(ctx, territoryCards(ctx.subject)) }),
    you({
      id: 'concept',
      stage: 'D1',
      label: 'Your pick',
      role: 'select',
      ask: async (ctx) => ({ kind: 'pick', prompt: 'Choose the concept to make.', k: 1, options: cardOptions(ctx) }),
      apply: pickCards,
    }),
    you({
      id: 'vo-script',
      stage: 'D1',
      label: 'Your words',
      role: 'voice',
      block: 'VOICE',
      ask: async (ctx) => ({
        kind: 'write',
        prompt: 'Write the voice-over script. It is locked after this step, and the frames are made to fit it.',
        initialText: voiceoverDraft(ctx.subject),
      }),
      apply: (ctx, res) => {
        ctx.state.voiceover = res.text;
      },
    }),
    ai({
      id: 'frames',
      stage: 'D2',
      label: 'Custom imagery',
      role: 'asset',
      block: 'ASSET',
      costUsd: 0.9,
      units: 3,
      work: async (ctx) => {
        const produced = await Promise.all(shotsFor(ctx.subject).map((s) => produce(ctx, frameSvg(s), SVG, { label: `Shot ${s.shot}`, shot: s.shot, candidate: s.shot - 1 })));
        ctx.state.frames = produced.map((p) => p.artifactId);
        return produced;
      },
    }),
    ai({
      id: 'relay',
      stage: 'D2',
      label: 'Motion',
      role: 'relay',
      block: 'RELAY',
      when: () => 'No video provider key is configured, so this run stops at the storyboard and frames.',
    }),
    ai({
      id: 'defect-check',
      stage: 'D2',
      label: 'Defect check',
      role: 'check',
      costUsd: 0.1,
      note: () => '1 frame regenerated: garbled text on a sign in shot 3.',
      work: async (ctx) => {
        const shot = shotsFor(ctx.subject)[2];
        if (!shot) return [];
        const p = await produce(ctx, frameSvg(shot, 2), SVG, { label: 'Shot 3, regenerated', shot: 3 });
        need(ctx.state.frames, 'frames')[2] = p.artifactId;
        return [p];
      },
    }),
    you({
      id: 'cut',
      stage: 'D3',
      label: 'Trim',
      role: 'cut',
      block: 'CUT',
      ask: async (ctx) => ({ kind: 'directive', prompt: 'One message, fewer elements. List what to drop, one item per line.', artifactIds: ctx.state.frames ?? [] }),
    }),
    ai({ id: 'tells-sweep', stage: 'D3', label: 'Cliché sweep', role: 'tells-sweep', block: 'TELLS', costUsd: 0.05, note: () => 'Flagged a stock sunrise in shot 4; the dusk street stays.' }),
    you({
      id: 'on-screen',
      stage: 'D3',
      label: 'Your words',
      role: 'voice',
      block: 'VOICE',
      ask: async (ctx) => ({
        kind: 'write',
        prompt: 'Write the tagline, headline and captions that appear on screen.',
        initialText: `Tagline: Made for the first five minutes.\nHeadline: ${cap(ctx.subject)}\nCaption: Available now.`,
      }),
      apply: (ctx, res) => {
        ctx.state.onScreen = res.text;
      },
    }),
    ai({ id: 'gate', stage: 'D3', label: 'Outside critique', role: 'critic', block: 'CRITIC', costUsd: 0.12, note: () => 'At or above the middle of the category lineup on the first try.' }),
  ],
  finish: async (ctx) => {
    const frames = ctx.state.frames ?? [];
    const tagline = /^Tagline:\s*(.+)$/im.exec(ctx.state.onScreen ?? '')?.[1];
    const storyboard = shotsFor(ctx.subject).map((s, i) => ({
      ...s,
      ...(i === 4 && tagline ? { description: `End card: ${tagline}` } : {}),
      ...(frames[i] ? { imageArtifactId: frames[i] } : {}),
    }));
    return ctx.put(JSON.stringify({ storyboard, voiceover: ctx.state.voiceover ?? '' }, null, 2), JSON_TYPE);
  },
};

// --- C6 Second Reader and C6a Fiction Second Reader ----------------------------------------------------------------

function auditSteps(fiction: boolean, writeId: string): ScriptStep[] {
  const annotate = (id: string, label: string, block: ScriptStep['block'], make: (text: string) => string, costUsd: number): ScriptStep =>
    ai({
      id,
      stage: 'D2',
      label,
      role: block === 'CRITIC' ? 'critic' : block === 'CUT' ? 'cut' : 'tells-sweep',
      ...(block ? { block } : {}),
      costUsd,
      work: async (ctx) => {
        const p = await produce(ctx, make(ctx.state.text ?? ''), MD, { label });
        ctx.state.notes = [...(ctx.state.notes ?? []), p.artifactId];
        return [p];
      },
    });
  return [
    annotate('cut-marks', 'Trim marks', 'CUT', trimMarks, 0.01),
    annotate('tells-flags', 'Cliché flags', 'TELLS', (t) => clicheFlags(t, fiction), 0.01),
    annotate('critic-rank', 'Outside critique', 'CRITIC', (t) => critiqueRank(t, fiction), 0.03),
    you({
      id: 'done',
      stage: 'D2',
      label: 'Done?',
      role: 'vision',
      ask: async (ctx) => ({
        kind: 'confirm',
        prompt: 'Is it done? Say no to revise it and get another round of notes.',
        artifactIds: (ctx.state.notes ?? []).slice(-3),
      }),
      apply: (ctx, res) => {
        ctx.state.done = res.approved === true;
        ctx.state.rounds = (ctx.state.rounds ?? 0) + 1;
      },
      again: (ctx) => (!ctx.state.done && (ctx.state.rounds ?? 0) < 5 ? writeId : undefined),
    }),
  ];
}

function writeStep(id: string, label: string, firstPrompt: string): ScriptStep {
  return you({
    id,
    stage: 'D2',
    label,
    role: 'voice',
    block: 'VOICE',
    ask: async (ctx) => ({
      kind: 'write',
      prompt: ctx.state.rounds ? 'Revise it. Your text is below, with the latest notes beside it.' : firstPrompt,
      initialText: ctx.state.text ?? attachment(ctx) ?? '',
      artifactIds: ctx.state.rounds ? (ctx.state.notes ?? []).slice(-3) : [],
    }),
    apply: async (ctx, res) => {
      ctx.state.text = res.text ?? '';
      ctx.state.current = await ctx.put(ctx.state.text, MD);
    },
  });
}

const c6: Script = {
  recipeId: 'c6',
  family: 'C6',
  title: 'Second Reader',
  medium: 'prose',
  steps: [
    ai({
      id: 'angles',
      stage: 'D1',
      label: 'Your direction',
      role: 'vision',
      block: 'VISION',
      costUsd: 0.03,
      when: (ctx) => (attachment(ctx) ? 'You brought a draft, so no angles were needed.' : true),
      work: async (ctx) => [
        await produce(
          ctx,
          `## Angles from your material\n\n- The specific moment you knew you wanted ${ctx.subject}.\n- A result you are proud of, with the number.\n- A setback, and what you changed because of it.\n`,
          MD,
          { label: 'Angles' },
        ),
      ],
    }),
    writeStep('draft', 'Your draft', 'Write your draft. Every sentence is yours; byway only points.'),
    ...auditSteps(false, 'draft'),
  ],
  finish: finishText,
};

const c6a: Script = {
  recipeId: 'c6a',
  family: 'C6a',
  title: 'Fiction Second Reader',
  medium: 'prose',
  steps: [
    ai({ id: 'premise-cards', stage: 'D1', label: 'Random spark', role: 'seed', block: 'SEED', costUsd: 0.05, units: 3, work: (ctx) => putCards(ctx, premiseCards()) }),
    ai({
      id: 'vanilla-overlap',
      stage: 'D1',
      label: 'Obvious-idea check',
      role: 'judge',
      costUsd: 0.02,
      note: () => 'A plain prompt wrote about a lighthouse keeper; none of the six cards overlap it.',
    }),
    you({
      id: 'premise',
      stage: 'D1',
      label: 'Your pick',
      role: 'select',
      ask: async (ctx) => ({ kind: 'pick', prompt: 'Choose the premise to write.', k: 1, options: cardOptions(ctx) }),
      apply: pickCards,
    }),
    you({
      id: 'story-brief',
      stage: 'D1',
      label: 'Your direction',
      role: 'vision',
      block: 'VISION',
      ask: async () => ({
        kind: 'react',
        prompt: 'Sharpen it into a brief for yourself: what the story is about underneath, and the feeling it should leave.',
      }),
      apply: (ctx, res) => {
        ctx.state.direction = res.text;
      },
    }),
    writeStep('pages', 'Your pages', 'Write your pages. Every sentence is yours; the notes only point.'),
    ...auditSteps(true, 'pages'),
  ],
  finish: finishText,
};

// --- C7 Lean Code Review -------------------------------------------------------------------------------------------

function diffVersion(id: string, label: string, diff: string, costUsd: number, extra: Partial<StepInput> = {}): ScriptStep {
  return ai({
    id,
    stage: 'D2',
    label,
    role: 'fix',
    costUsd,
    work: async (ctx) => {
      ctx.state.diff = diff;
      const p = await produce(ctx, diff, DIFF, { label });
      ctx.state.current = p.artifactId;
      return [p];
    },
    ...extra,
  });
}

const c7: Script = {
  recipeId: 'c7',
  family: 'C7',
  title: 'Lean Code Review',
  medium: 'code-diff',
  steps: [
    diffVersion('implement', 'Implement', DIFF_IMPLEMENT, 0.08, { role: 'build', units: 2 }),
    tool({ id: 'objective-checks', stage: 'D2', label: 'Objective checks', role: 'check', note: () => 'Lint and types pass. Found 1 leftover TODO and an unused debug flag.' }),
    diffVersion('cut-scope', 'Trim', DIFF_SCOPED, 0.03, { role: 'cut', block: 'CUT', note: () => 'Removed an unrequested helper and the debug flag.' }),
    diffVersion('review-loop', 'Outside critique', DIFF_SCOPED, 0.12, {
      role: 'critic',
      block: 'CRITIC',
      iterations: 2,
      units: 2,
      note: () => 'Reviewability at the middle of 4 merged pull requests after 2 rounds.',
    }),
    diffVersion('cut-review', 'Trim', DIFF_REVIEWED, 0.02, { role: 'cut', block: 'CUT', note: () => 'Removed comments that narrate the code.' }),
    ai({
      id: 'tells-sweep',
      stage: 'D3',
      label: 'Cliché sweep',
      role: 'tells-sweep',
      block: 'TELLS',
      costUsd: 0.02,
      work: async (ctx) => {
        ctx.state.before = ctx.state.current;
        const flags = await produce(ctx, '## Cliché sweep\n\n- **Naming:** the accumulator `d` hides what it sums. Swap: `total`.\n', MD, { label: 'Flags' });
        const after = await produce(ctx, DIFF_SWEPT, DIFF, { label: 'With swaps' });
        ctx.state.after = after.artifactId;
        return [flags, after];
      },
    }),
    you({
      id: 'tells-compare',
      stage: 'D3',
      label: 'Keep or revert',
      role: 'tells-compare',
      block: 'TELLS',
      ask: async (ctx) => ({
        kind: 'compare',
        prompt: 'Keep the swaps, or go back to the diff before them?',
        options: [
          { id: 'A', label: 'Before the swaps', artifactId: need(ctx.state.before, 'before') },
          { id: 'B', label: 'After the swaps', artifactId: need(ctx.state.after, 'after') },
        ],
      }),
      apply: (ctx, res) => {
        ctx.state.diff = res.choice?.[0] === 'A' ? DIFF_REVIEWED : DIFF_SWEPT;
      },
    }),
    you({
      id: 'voice',
      stage: 'D3',
      label: 'Your words',
      role: 'voice',
      block: 'VOICE',
      ask: async () => ({ kind: 'write', prompt: "Write the pull request's why: what changed, the tradeoffs, and how you verified it.", initialText: WHY_DRAFT }),
      apply: (ctx, res) => {
        ctx.state.why = res.text;
      },
    }),
  ],
  finish: async (ctx) => {
    const why = (ctx.state.why ?? WHY_DRAFT).trim();
    return ctx.put(`${need(ctx.state.diff, 'diff')}\n${/^Why:/.test(why) ? why : `Why: ${why}`}\n`, DIFF);
  },
};

export const SCRIPTS: Script[] = [c1, c2, c3, c4, c5, c6, c6a, c7];

/** Scripts are found by family, so a composed recipe runs its nearest canonical recipe's script. */
export function scriptFor(family: string): Script | undefined {
  return SCRIPTS.find((s) => s.family.toLowerCase() === family.toLowerCase());
}
