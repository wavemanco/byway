/**
 * Every purpose the catalog's recipes can make the runner send has a demo responder, and its answer meets the spec §3.3
 * contract when the prompt follows the shared slot conventions (spec §3.2 "Prompt slots by port", §3.3): the problem in
 * <problem>, the current artifact as one fenced block, labelled candidates as "### A" headings, unseeded overlap answers
 * as "### V1", the relay brief as "Shot N", and the GREAT critic's lineup line. Prompts here are written the way the
 * templates render them; the answers are read by the reference parsers in contract.ts, not by the mock's own code.
 */
import { PROTOCOL_CONFIGS } from '@byway/catalog';
import type { Medium } from '@byway/contracts';
import { walk, walkNode, type Recipe } from '@byway/recipe';
import { describe, expect, it } from 'vitest';
import { responderFor } from '../src/mock/responders.ts';
import { mockAdapter } from '../src/providers/mock.ts';
import type { ProviderCompletionRequest } from '../src/providers/types.ts';
import { checkContract, lastBlock, type CheckContext } from './contract.ts';

/** The purposes a recipe's run can emit: model steps by role and medium, plus the runner's helper calls (spec §3.2). */
function purposesOf(recipe: Recipe): string[] {
  const medium = recipe.medium as Medium;
  const out = new Set<string>();
  let asset = false;
  let voice = false;
  let criticLoop = false;
  walk(recipe, (n, path, stage) => {
    if (n.op === 'step' && n.actor === 'model') out.add(`${n.role}:${medium}`);
    if (n.op === 'step' && n.block === 'ASSET') asset = true;
    if (n.op === 'step' && n.block === 'VOICE') voice = true;
    if (n.op === 'loop') {
      walkNode(n.body, path, stage, (c) => {
        if (c.op === 'step' && c.role === 'critic') criticLoop = true;
      });
    }
  });
  if (asset) {
    out.add(`asset.briefs:${medium}`);
    if (medium === 'web-page' || medium === 'prose') out.add(`asset.integrate:${medium}`);
  }
  if (voice) out.add(`voice.apply:${medium}`);
  if (criticLoop) out.add(`rerank:${medium}`);
  return [...out];
}

const ADVISOR = ['advisor.intake', 'advisor.compose', 'advisor.compose.repair'];
const PURPOSES = [...new Set([...PROTOCOL_CONFIGS.flatMap(purposesOf), 'relay:media', ...ADVISOR])].sort();

const PROBLEMS: Record<Medium, string> = {
  'web-page': 'A landing page for a neighborhood bakery that delivers sourdough before 7am',
  prose: 'A status update memo for leadership on the billing migration',
  options: 'Positioning options for a bike repair subscription',
  media: 'A 30-second video ad for trail running shoes',
  'code-diff': 'Trim this agent-written refactor of the invoice formatter',
};

const STORYBOARD = {
  storyboard: [
    { shot: 1, description: 'Open on muddy shoes by the door.', imagePrompt: 'Muddy trail shoes by a cabin door, early light', durationSec: 4 },
    { shot: 2, description: 'The runner crests a ridge.', imagePrompt: 'A runner cresting a rocky ridge at dawn, wide shot', durationSec: 6 },
    { shot: 3, description: 'Close on the name and one line.', imagePrompt: 'The shoe on a plain stone, generous negative space', durationSec: 3 },
  ],
  voiceover: 'Some trails ask more of you. Bring shoes that ask less.',
};
const OPTIONS = {
  options: [
    { title: 'The narrow wedge', pitch: 'Fix flats for commuters, same day.', rationale: 'One painful job, done well.' },
    { title: 'The service first', pitch: 'Tune ten bikes by hand before building anything.', rationale: 'Learn before automating.' },
    { title: 'The partner route', pitch: 'Sell through the shops riders already trust.', rationale: 'Borrowed trust.' },
  ],
};
const DIFF = '--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1,1 +1,1 @@\n-const a = 1;\n+const a = 2;';

/** The current artifact as the runner puts it in the artifact slot: one fenced block in the medium's format. */
const ARTIFACT: Record<Medium, string> = {
  'web-page':
    '```html\n<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Bakery</title></head><body><main><figure class="art" data-slot="hero"><svg viewBox="0 0 4 3"></svg></figure><h1>Sourdough before seven</h1><p>Order by 9pm.</p></main></body></html>\n```',
  prose: '```markdown\n# Billing migration update\n\nThe migration is on track for the 24th, and rework is down to half a day a week.\n\n## Risks\n\nTwo people carry most of the context.\n```',
  options: `\`\`\`json\n${JSON.stringify(OPTIONS, null, 2)}\n\`\`\``,
  media: `\`\`\`json\n${JSON.stringify(STORYBOARD, null, 2)}\n\`\`\``,
  'code-diff': `\`\`\`diff\n${DIFF}\n\`\`\`\n\nWhy: the default changed.`,
};

/** A text view in the view slot (spec §3.2 "Views by medium"); screenshot views are attached images instead. */
const VIEW: Record<Medium, { text: string; images: number }> = {
  'web-page': { text: '', images: 2 },
  prose: { text: '# Billing migration update\n\nThe migration is on track for the 24th. We delve into a seamless way to unlock value.', images: 0 },
  options: { text: OPTIONS.options.map((o, i) => `${i + 1}. ${o.title}: ${o.pitch}`).join('\n'), images: 0 },
  media: { text: STORYBOARD.storyboard.map((s) => `Shot ${s.shot} (${s.durationSec}s): ${s.description}`).join('\n'), images: 3 },
  'code-diff': { text: DIFF, images: 0 },
};

const labelled = (labels: string[], texts: string[]) => labels.map((l, i) => `### ${l}\n${texts[i % texts.length]}`).join('\n\n');
const LETTERS = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
const IMG_A = `sha256:${'a'.repeat(64)}`;
const IMG_B = `sha256:${'b'.repeat(64)}`;
const QUESTIONS = [
  { id: 'decision', routesTo: 'c2', text: 'Is the output a decision or option set?' },
  { id: 'visual', routesTo: 'c1', text: 'A rendered visual artifact?' },
];

interface Scenario {
  name: string;
  prompt: string;
  images?: number;
  ctx?: CheckContext;
}

/** The prompt(s) a purpose is sent with, written to the slot conventions; throws for a purpose it does not know. */
function scenarios(purpose: string): Scenario[] {
  const i = purpose.lastIndexOf(':');
  const role = i < 0 ? purpose : purpose.slice(0, i);
  const medium = (i < 0 ? 'prose' : purpose.slice(i + 1)) as Medium;
  const problem = `<problem>${PROBLEMS[medium]}</problem>`;
  const view = VIEW[medium];
  switch (role) {
    case 'build':
    case 'asset':
      return [{ name: 'from the problem', prompt: `${problem}\nBrief: keep it plain and specific.` }];
    case 'seed':
      return [{ name: 'with a seed', prompt: `${problem}\nSeed: q8Zr2kLx. Interpret it for direction; never reveal it.` }];
    case 'vision':
      return [{ name: 'a direction', prompt: `${problem}\nTaste: warmer, less corporate.` }];
    case 'fix':
      return [{ name: 'applies a critique', prompt: `Critique:\n- Tighten the opening.\n\n${ARTIFACT[medium]}` }];
    case 'voice.apply':
      return [{ name: "writes the owner's words in", prompt: `Your words:\nOur bakery opens at six.\n\n${ARTIFACT[medium]}` }];
    case 'critic':
      return [
        { name: 'OK mode', prompt: `Critique the work as its audience meets it.\n\n${view.text}`, images: view.images, ctx: { mode: 'OK' } },
        {
          name: 'GREAT mode',
          prompt: `GREAT mode: rank ours among the references, unsigned.\nThere are 4 references and 1 of ours (5 items, labelled A–E).\n\n${labelled(LETTERS(5), ['A strong example.'])}`,
          images: view.images,
          ctx: { mode: 'GREAT', lineup: 5 },
        },
      ];
    case 'check':
    case 'cut':
    case 'tells-sweep':
      return [{ name: 'reads the view', prompt: `Read the work as its audience meets it.\n\n${view.text}\n\nTells:\n- delve\n- seamless`, images: view.images }];
    case 'dedupe':
      return [{ name: 'merges by label', prompt: `Keep one of each cluster of near-duplicates.\n\n${labelled(LETTERS(6), OPTIONS.options.map((o) => `${o.title}: ${o.pitch}`))}`, ctx: { labels: LETTERS(6) } }];
    case 'overlap':
      return [
        {
          name: 'flags seeded options against V answers',
          prompt: `Plain answers:\n${labelled(['V1', 'V2', 'V3'], ['A subscription for tune-ups.'])}\n\nOur options:\n${labelled(LETTERS(4), OPTIONS.options.map((o) => o.title))}`,
          ctx: { labels: LETTERS(4), vanillaLabels: ['V1', 'V2', 'V3'] },
        },
      ];
    case 'relay':
      return [{ name: 'one link', prompt: `${ARTIFACT.media}\n\nShot 2\n\nWrite the clip prompt for this link.` }];
    case 'rerank':
      return medium === 'web-page'
        ? [{ name: 'snapshots attached', prompt: 'Which snapshot is strongest? They are attached in order.', images: 3, ctx: { labels: LETTERS(3) } }]
        : [{ name: 'labelled snapshots', prompt: `Which version is strongest?\n\n${labelled(LETTERS(3), ['First.', 'Second.', 'Third.'])}`, ctx: { labels: LETTERS(3) } }];
    case 'asset.briefs':
      switch (medium) {
        case 'web-page':
          return [{ name: 'page slots', prompt: `${problem}\nPropose up to 2 images.\n\n${ARTIFACT['web-page']}`, ctx: { maxBriefs: 2 } }];
        case 'options':
          return [{ name: 'one per option', prompt: `${problem}\n\n${labelled(LETTERS(3), OPTIONS.options.map((o) => o.title))}`, ctx: { slots: LETTERS(3) } }];
        case 'media':
          return [{ name: 'one per shot', prompt: `${problem}\n\n${ARTIFACT.media}`, ctx: { slots: ['1', '2', '3'] } }];
        default:
          return [{ name: 'an illustration', prompt: `${problem}\n\n${ARTIFACT[medium]}`, ctx: { maxBriefs: 1 } }];
      }
    case 'asset.integrate':
      return medium === 'web-page'
        ? [{ name: 'by id and slot', prompt: `Images:\n${IMG_A} | A loaf on a board | hero\n${IMG_B} | The oven at dawn | detail\n\n${ARTIFACT['web-page']}`, ctx: { images: [`/api/artifacts/${IMG_A}`, `/api/artifacts/${IMG_B}`] } }]
        : [{ name: 'Markdown image lines', prompt: `Images:\n![Rework hours by week](/api/artifacts/${IMG_A})\n\n${ARTIFACT[medium]}`, ctx: { images: [`![Rework hours by week](/api/artifacts/${IMG_A})`] } }];
    case 'advisor.intake':
      return [{ name: 'chooser answers', prompt: `\`\`\`json\n${JSON.stringify(QUESTIONS)}\n\`\`\`\n${problem}`, ctx: { questionIds: QUESTIONS.map((q) => q.id) } }];
    case 'advisor.compose':
    case 'advisor.compose.repair':
      return [{ name: 'a composed recipe', prompt: problem }];
    default:
      throw new Error(`no scenario for ${purpose}`);
  }
}

let n = 0;
async function ask(purpose: string, prompt: string, images = 0, stepId = 'step'): Promise<string> {
  n += 1;
  const content: ProviderCompletionRequest['messages'][number]['content'] = [{ type: 'text', text: prompt }];
  for (let k = 0; k < images; k++) content.push({ type: 'image', image: { artifactId: `sha256:${k}`, mediaType: 'image/png', base64: '' } });
  const out = await mockAdapter().complete({
    model: 'mock-mid',
    messages: [{ role: 'user', content }],
    maxOutputTokens: 4000,
    responseFormat: 'text',
    context: { workspaceId: 'ws', runId: `run-${n}`, stepId, purpose, profileId: 'demo' },
  });
  return out.text;
}

describe('mock responders cover every purpose the catalog can emit', () => {
  it('collects the purposes of c1–c7 and c6a, helpers included', () => {
    expect(PURPOSES).toEqual(
      expect.arrayContaining([
        'seed:web-page',
        'critic:web-page',
        'asset.briefs:web-page',
        'asset.integrate:web-page',
        'dedupe:options',
        'overlap:options',
        'asset.briefs:options',
        'overlap:prose',
        'asset.briefs:prose',
        'asset.integrate:prose',
        'rerank:prose',
        'dedupe:media',
        'overlap:media',
        'relay:media',
        'check:media',
        'asset.briefs:media',
        'critic:media',
        'cut:code-diff',
        'check:code-diff',
        'rerank:code-diff',
        'voice.apply:code-diff',
        ...ADVISOR,
      ]),
    );
    // No asset.integrate on options or media: the runner attaches the images itself (spec §3.3).
    expect(PURPOSES).not.toContain('asset.integrate:options');
    expect(PURPOSES).not.toContain('asset.integrate:media');
  });

  describe.each(PURPOSES)('%s', (purpose) => {
    it('has a responder of its own', () => {
      expect(responderFor(purpose), purpose).toBeDefined();
    });

    it.each(scenarios(purpose).map((s) => [s.name, s] as const))('answers to the contract: %s', async (_name, s) => {
      const out = await ask(purpose, s.prompt, s.images ?? 0);
      expect(checkContract(purpose, out, s.ctx ?? {}), out).toEqual([]);
    });
  });
});

describe('mock responders: the conventions they read', () => {
  it('relay:media writes the clip for the shot the brief names, with that shot’s length', async () => {
    const out = JSON.parse(lastBlock(await ask('relay:media', `${ARTIFACT.media}\n\nShot 2`), 'json') as string) as { clipPrompt: string; durationSec: number };
    expect(out.clipPrompt).toMatch(/^Shot 2: /);
    expect(out.clipPrompt).toContain('crests a ridge');
    expect(out.durationSec).toBe(6);
    // "shot" keys inside the storyboard JSON do not count as the brief.
    const third = JSON.parse(lastBlock(await ask('relay:media', `${ARTIFACT.media}\n\nShot 3`), 'json') as string) as { durationSec: number };
    expect(third.durationSec).toBe(3);
  });

  it('dedupe merges near-duplicates into kept labels, and keeps everything when the field is small', async () => {
    const big = JSON.parse(lastBlock(await ask('dedupe:options', labelled(LETTERS(8), ['x'])), 'json') as string) as { keep: string[]; merged: { into: string; from: string[] }[] };
    expect(big.merged.length).toBeGreaterThan(0);
    expect([...big.keep, ...big.merged.flatMap((m) => m.from)].sort()).toEqual(LETTERS(8));
    const small = JSON.parse(lastBlock(await ask('dedupe:media', labelled(LETTERS(3), ['x'])), 'json') as string);
    expect(small).toEqual({ keep: ['A', 'B', 'C'], merged: [] });
  });

  it('overlap flags nothing when there are no unseeded answers to compare with', async () => {
    const out = JSON.parse(lastBlock(await ask('overlap:prose', labelled(LETTERS(3), ['x'])), 'json') as string);
    expect(out).toEqual({ flags: [] });
  });

  it('a GREAT critic ranks among the lineup it is told, and its rank improves round by round', async () => {
    const adapter = mockAdapter();
    const lineup = 'GREAT mode.\nThere are 9 references and 1 of ours (10 items, labelled A–J).';
    const ranks: number[] = [];
    for (let round = 0; round < 3; round++) {
      const out = await adapter.complete({
        model: 'mock-big',
        messages: [{ role: 'user', content: [{ type: 'text', text: lineup }] }],
        maxOutputTokens: 4000,
        responseFormat: 'text',
        context: { workspaceId: 'ws', runId: 'great-run', stepId: 'critic', purpose: 'critic:prose', profileId: 'demo' },
      });
      const m = /Rank: (\d+) of (\d+)$/.exec(out.text.trim());
      expect(m?.[2]).toBe('10');
      ranks.push(Number(m?.[1]));
    }
    // C3's loop stops at rank 3 or better within its 3 rounds, so the demo converges.
    expect(ranks[0]).toBeGreaterThan(3);
    expect(ranks.at(-1)).toBeLessThanOrEqual(3);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });

  it('asset.briefs on media and options follow the storyboard shots and option labels', async () => {
    const media = JSON.parse(lastBlock(await ask('asset.briefs:media', ARTIFACT.media), 'json') as string) as { images: { slot: string; prompt: string; size: string }[] };
    expect(media.images.map((b) => [b.slot, b.prompt])).toEqual(STORYBOARD.storyboard.map((s) => [String(s.shot), s.imagePrompt]));
    expect(new Set(media.images.map((b) => b.size))).toEqual(new Set(['1536x1024']));
    const options = JSON.parse(lastBlock(await ask('asset.briefs:options', labelled(LETTERS(3), OPTIONS.options.map((o) => o.title))), 'json') as string) as { images: { slot: string; prompt: string }[] };
    expect(options.images.map((b) => b.slot)).toEqual(['A', 'B', 'C']);
    expect(options.images[1]?.prompt).toContain('The service first');
  });

  it('asset.integrate places prose images after the opening paragraph, and page images in their slots', async () => {
    const line = `![Rework hours by week](/api/artifacts/${IMG_A})`;
    const md = lastBlock(await ask('asset.integrate:prose', `Images:\n${line}\n\n${ARTIFACT.prose}`), 'markdown') as string;
    expect(md.split('\n\n').slice(0, 3)).toEqual(['# Billing migration update', 'The migration is on track for the 24th, and rework is down to half a day a week.', line]);
    expect(md.match(/!\[/g)).toHaveLength(1);
    const html = lastBlock(await ask('asset.integrate:web-page', `Images:\n${IMG_A} | A loaf on a board | hero\n${IMG_B} | The oven at dawn | detail\n\n${ARTIFACT['web-page']}`), 'html') as string;
    expect(html).toContain(`<figure class="art" data-slot="hero"><img src="/api/artifacts/${IMG_A}" alt="A loaf on a board"></figure>`);
    expect(html).toContain(`<img src="/api/artifacts/${IMG_B}" alt="The oven at dawn">`);
  });

  it('voice.apply and fix hand back the structured artifact they were given', async () => {
    for (const medium of ['options', 'media'] as const) {
      const out = await ask(`voice.apply:${medium}`, `Your words:\nOur name is Spoke.\n\n${ARTIFACT[medium]}`);
      expect(JSON.parse(lastBlock(out, 'json') as string)).toEqual(medium === 'options' ? OPTIONS : STORYBOARD);
    }
    const diff = await ask('voice.apply:code-diff', `Your words:\nWhy: callers expect 2.\n\n${ARTIFACT['code-diff']}`);
    expect(lastBlock(diff, 'diff')).toBe(DIFF);
  });
});
