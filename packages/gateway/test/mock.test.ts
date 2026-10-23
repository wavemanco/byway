import { MEDIA, type Medium } from '@byway/contracts';
import { describe, expect, it } from 'vitest';
import { imageSize } from '../src/estimate.ts';
import { fencedBlocks, outsideFences } from '../src/mock/extract.ts';
import { revisionOf } from '../src/mock/revision.ts';
import { mockAdapter } from '../src/providers/mock.ts';
import type { ProviderCompletionRequest } from '../src/providers/types.ts';
import { checkContract, lastBlock } from './contract.ts';

const PROBLEMS: Record<Medium, string> = {
  'web-page': 'A landing page for a neighborhood bakery that delivers sourdough before 7am',
  prose: 'A status update memo for leadership on the billing migration',
  options: 'Positioning options for a bike repair subscription',
  media: 'A 30-second video ad for trail running shoes',
  'code-diff': 'Trim this agent-written refactor of the invoice formatter',
};

let n = 0;
function req(purpose: string, prompt: string, over: Partial<ProviderCompletionRequest> = {}, images = 0): ProviderCompletionRequest {
  n += 1;
  const content: ProviderCompletionRequest['messages'][number]['content'] = [{ type: 'text', text: prompt }];
  for (let i = 0; i < images; i++) content.push({ type: 'image', image: { artifactId: `sha256:${i}`, mediaType: 'image/png', base64: '' } });
  return {
    model: 'mock-mid',
    messages: [{ role: 'user', content }],
    maxOutputTokens: 4000,
    responseFormat: 'text',
    context: { workspaceId: 'ws', runId: `run-${n}`, stepId: 'step', purpose, profileId: 'demo' },
    ...over,
  };
}

const ask = async (purpose: string, prompt: string, images = 0) => (await mockAdapter().complete(req(purpose, prompt, {}, images))).text;

describe('mock provider: output contracts for every purpose and medium', () => {
  const builders = ['build', 'seed', 'fix', 'asset.integrate'];
  for (const medium of MEDIA) {
    for (const role of builders) {
      it(`${role}:${medium}`, async () => {
        const out = await ask(`${role}:${medium}`, `<problem>${PROBLEMS[medium]}</problem>\nWork from this.`);
        expect(checkContract(`${role}:${medium}`, out)).toEqual([]);
      });
    }
    it(`critic:${medium}`, async () => {
      expect(checkContract(`critic:${medium}`, await ask(`critic:${medium}`, 'Critique the attached render.', 2))).toEqual([]);
    });
    for (const role of ['judge', 'select', 'rerank']) {
      it(`${role}:${medium}`, async () => {
        const out = await ask(`${role}:${medium}`, 'Candidate A: first.\nCandidate B: second.\nCandidate C: third.\nPick the strongest.');
        expect(checkContract(`${role}:${medium}`, out, { labels: ['A', 'B', 'C'] })).toEqual([]);
      });
    }
    it(`check:${medium}`, async () => {
      expect(checkContract(`check:${medium}`, await ask(`check:${medium}`, 'List objective defects only.'))).toEqual([]);
    });
    it(`cut:${medium}`, async () => {
      expect(checkContract(`cut:${medium}`, await ask(`cut:${medium}`, 'What would the reader miss?'))).toEqual([]);
    });
    it(`tells-sweep:${medium}`, async () => {
      const out = await ask(`tells-sweep:${medium}`, 'Sweep this text: We delve into a seamless way to unlock value.');
      expect(checkContract(`tells-sweep:${medium}`, out)).toEqual([]);
    });
    it(`tells-compare:${medium}`, async () => {
      expect(checkContract(`tells-compare:${medium}`, await ask(`tells-compare:${medium}`, 'Version A and Version B. Which to keep?'))).toEqual([]);
    });
    it(`vision:${medium}`, async () => {
      expect(checkContract(`vision:${medium}`, await ask(`vision:${medium}`, `<problem>${PROBLEMS[medium]}</problem>`))).toEqual([]);
    });
    it(`rerank:${medium} with labels taken from images`, async () => {
      expect(checkContract(`rerank:${medium}`, await ask(`rerank:${medium}`, 'Rank the attached snapshots.', 3), { labels: ['A', 'B', 'C'] })).toEqual([]);
    });
  }

  it('media: the storyboard carries its on-screen copy (headline, tagline, a caption per shot) for the late VOICE (C4)', async () => {
    const sb = JSON.parse(lastBlock(await ask('build:media', `<problem>${PROBLEMS.media}</problem>`), 'json') as string) as {
      storyboard: { caption?: string }[];
      headline?: string;
      tagline?: string;
      voiceover: string;
    };
    expect(sb.headline).toMatch(/\S/);
    expect(sb.tagline).toMatch(/\S/);
    expect(sb.storyboard.every((s) => typeof s.caption === 'string' && s.caption.length > 0)).toBe(true);
    // The copy is not the voice-over: the VO is locked after its own step, the copy is edited later.
    expect([sb.headline, sb.tagline]).not.toContain(sb.voiceover);
  });

  it('asset.briefs:web-page honours the slot count', async () => {
    const out = await ask('asset.briefs:web-page', '<problem>A bakery page</problem>\nPropose up to 2 images for the page.');
    expect(checkContract('asset.briefs:web-page', out, { maxBriefs: 2 })).toEqual([]);
    expect(JSON.parse(lastBlock(out, 'json') as string).images).toHaveLength(2);
  });

  it('critic answers with a ranking of every label in GREAT mode', async () => {
    const out = await ask('critic:prose', 'GREAT mode. There are 4 references and 1 of ours (5 items, labelled A–E).');
    expect(out.trim().split('\n').at(-1)).toMatch(/^Ranking: [A-E](, [A-E]){4}$/);
    expect(checkContract('critic:prose', out, { mode: 'GREAT', lineup: 5 })).toEqual([]);
    // A hand-written GREAT prompt with only a reference count still gets a full ranking.
    const loose = await ask('critic:prose', 'GREAT mode: compare the draft with the 4 references.');
    expect(checkContract('critic:prose', loose, { mode: 'GREAT', lineup: 5 })).toEqual([]);
  });

  it('check reports placeholders as defects', async () => {
    const out = await ask('check:web-page', 'Page text: Lorem ipsum dolor. TODO: pricing.');
    expect(out).toContain('- Placeholder');
    expect(checkContract('check:web-page', out)).toEqual([]);
  });

  it('tells-sweep finds tells in text views', async () => {
    const out = await ask('tells-sweep:prose', 'We delve into a seamless way to unlock value.');
    expect(JSON.parse(lastBlock(out, 'json') as string).hits.map((h: { pattern: string }) => h.pattern)).toEqual(['delve', 'seamless', 'unlock']);
  });
});

describe('mock provider: behaviour', () => {
  it('is deterministic for the same prompt', async () => {
    const a = await ask('build:web-page', '<problem>A page for a tea shop</problem>');
    const b = await ask('build:web-page', '<problem>A page for a tea shop</problem>');
    expect(a).toBe(b);
  });

  it('varies seeded web pages with the seed string, and never reveals the seed', async () => {
    const seeds = ['q8Zr2kLx', 'Vt3nB0aa', 'mm91XcpQ', 'Lw7Yh2Ue'];
    const pages = await Promise.all(seeds.map((s) => ask('seed:web-page', `<problem>A landing page for a ceramics studio</problem>\nSeed: ${s}. Interpret it for direction; never reveal it.`)));
    expect(new Set(pages).size).toBe(4);
    const looks = new Set(pages.map((p) => /--bg:(#[0-9a-f]{6})/.exec(p)?.[1]));
    expect(looks.size).toBeGreaterThanOrEqual(2);
    pages.forEach((p, i) => expect(p).not.toContain(seeds[i]));
    // The headline is the subject without the request phrasing ("a landing page for").
    expect(pages[0]).toContain('<h1>Ceramics studio</h1>');
  });

  it('raises the critic score each iteration of the same loop, so loops reach a threshold of 9', async () => {
    const adapter = mockAdapter();
    const scores: number[] = [];
    for (let i = 0; i < 5; i++) {
      const out = await adapter.complete(req('critic:web-page', 'Critique this render.', { context: { workspaceId: 'ws', runId: 'r1', stepId: 'critic', purpose: 'critic:web-page', profileId: 'demo' } }));
      scores.push(Number(/Score: (\d+)\/10/.exec(out.text)?.[1]));
    }
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(scores[3]).toBeGreaterThanOrEqual(9);
    expect(Math.max(...scores)).toBeLessThanOrEqual(10);
  });

  it('revises the page it is given on a fix turn', async () => {
    const page = lastBlock(await ask('build:web-page', '<problem>A page for a florist</problem>'), 'html') as string;
    const fixed = lastBlock(await ask('fix:web-page', `Critique:\n- Tighten the hero.\n\nPage:\n\`\`\`html\n${page}\n\`\`\``), 'html') as string;
    expect(fixed).not.toBe(page);
    expect(fixed).toContain('<meta name="byway-revision" content="1">');
    expect(fixed.replace(/\s*<meta name="byway-revision" content="\d+">/, '').replace(/--measure:\d+rem/, '')).toBe(page.replace(/--measure:\d+rem/, ''));
  });

  it('integrates the image URLs it is given', async () => {
    const page = lastBlock(await ask('build:web-page', '<problem>A page for a florist</problem>'), 'html') as string;
    const prompt = `Images:\n- hero: /api/artifacts/sha256:aaa\n- detail: /api/artifacts/sha256:bbb\n\n\`\`\`html\n${page}\n\`\`\``;
    const out = lastBlock(await ask('asset.integrate:web-page', prompt), 'html') as string;
    expect(out).toContain('<img src="/api/artifacts/sha256:aaa"');
    expect(out).toContain('<img src="/api/artifacts/sha256:bbb"');
    expect(out).not.toMatch(/data-slot="hero"><svg/);
  });

  it('reads the whole document from a markdown block that holds a code block, or from a longer outer fence (ENG-1)', async () => {
    const T = '```';
    const doc = ['# Setup', '', 'Install it first:', '', `${T}bash`, 'pnpm install', T, '', 'Then run it.'].join('\n');
    // An integrate turn with no image to place hands the document back as it read it.
    expect(await ask('asset.integrate:prose', `Place these images.\n${T}markdown\n${doc}\n${T}`)).toBe(`${T}markdown\n${doc}\n${T}`);
    // Its own code block bare, the document comes in a 4-backtick fence, as the templates ask.
    const bare = doc.replace(`${T}bash`, T);
    expect(await ask('asset.integrate:prose', `Place these images.\n\`\`\`\`markdown\n${bare}\n\`\`\`\``)).toBe(`${T}markdown\n${bare}\n${T}`);
  });

  it('lets tests override responders by purpose or role', async () => {
    const adapter = mockAdapter({ responders: { 'critic:prose': () => '- override\nScore: 3/10', judge: () => 'Choice: B' } });
    expect((await adapter.complete(req('critic:prose', 'x'))).text).toBe('- override\nScore: 3/10');
    expect((await adapter.complete(req('critic:web-page', 'x'))).text).not.toContain('override');
    expect((await adapter.complete(req('judge:options', 'x'))).text).toBe('Choice: B');
  });

  it('never reports truncation on its own, even when the answer is longer than the output cap', async () => {
    const out = await mockAdapter().complete(req('build:web-page', PROBLEMS['web-page'], { maxOutputTokens: 1 }));
    expect(out.usage.outputTokens).toBeGreaterThan(1);
    expect(out.truncated).toBeUndefined();
  });

  it('reports truncation when a test responder asks for it', async () => {
    const adapter = mockAdapter({ responders: { 'advisor.compose': () => ({ text: '{"kind": "composed", "steps": [', truncated: true }), critic: () => ({ text: '- whole\nScore: 8/10' }) } });
    const cut = await adapter.complete(req('advisor.compose', 'x'));
    expect([cut.text, cut.truncated]).toEqual(['{"kind": "composed", "steps": [', true]);
    expect(cut.responseBody).toMatchObject({ text: cut.text, truncated: true });
    const whole = await adapter.complete(req('critic:prose', 'x'));
    expect([whole.text, whole.truncated]).toEqual(['- whole\nScore: 8/10', undefined]);
  });

  it('generates small deterministic PNGs at the requested aspect ratio', async () => {
    const adapter = mockAdapter();
    const ctx = { workspaceId: 'ws', purpose: 'asset:web-page', profileId: 'demo' };
    const sizes = { '1024x1024': [64, 64], '1536x1024': [96, 64], '1024x1536': [64, 96] } as const;
    for (const [size, [w, h]] of Object.entries(sizes)) {
      const img = await adapter.image!({ model: 'mock-image', prompt: 'sourdough loaf', size: size as keyof typeof sizes, context: ctx });
      expect(Buffer.from(img.bytes.subarray(0, 8)).toString('hex')).toBe('89504e470d0a1a0a');
      expect(imageSize(img.bytes)).toEqual({ width: w, height: h });
      expect(img.bytes.length).toBeLessThan(20_000);
    }
    const a = await adapter.image!({ model: 'mock-image', prompt: 'same', size: '1024x1024', context: ctx });
    const b = await adapter.image!({ model: 'mock-image', prompt: 'same', size: '1024x1024', context: ctx });
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });
});

describe('mock provider: advisor', () => {
  const questions = [
    { id: 'decision', routesTo: 'c2', text: 'Is the output a decision or option set?' },
    { id: 'code', routesTo: 'c7', text: 'An agent-written code change?' },
    { id: 'media', routesTo: 'c5', text: 'Specialist media?' },
    { id: 'visual', routesTo: 'c1', text: 'A rendered visual artifact?' },
    { id: 'fiction', routesTo: 'c6a', text: 'Fiction you author yourself?' },
    { id: 'series', routesTo: 'c3', text: 'Content produced as a series?' },
    { id: 'effort', routesTo: 'c6', text: "A signal of the sender's own effort?" },
  ];
  const intakePrompt = (problem: string) => `Answer each question.\n\`\`\`json\n${JSON.stringify(questions)}\n\`\`\`\n<problem>${problem}</problem>`;
  const firstYes = async (problem: string) => {
    const out = await ask('advisor.intake', intakePrompt(problem));
    expect(checkContract('advisor.intake', out, { questionIds: questions.map((q) => q.id) })).toEqual([]);
    const parsed = JSON.parse(lastBlock(out, 'json') as string) as { answers: { questionId: string; answer: boolean }[]; routes: Record<string, string> };
    return { first: parsed.answers.find((a) => a.answer)?.questionId, routes: parsed.routes };
  };

  it.each([
    ['Give me ten name ideas for my coffee roastery', 'decision'],
    ['This agent-written diff to our TypeScript repo is bloated; trim it', 'code'],
    ['A 30-second video ad for trail running shoes', 'media'],
    ['A landing page for a neighborhood bakery', 'visual'],
    ['The next chapter of my fantasy novel', 'fiction'],
    ['A weekly newsletter series about urban gardening', 'series'],
    ['My cover letter for a museum curator job', 'effort'],
    ['A status update memo for leadership on the billing migration', undefined],
  ])('routes "%s" to %s', async (problem, expected) => {
    expect((await firstYes(problem)).first).toBe(expected);
  });

  it('proposes the seed entry for visual work, and vision when the user brings a direction', async () => {
    expect((await firstYes('A landing page for a bakery')).routes).toEqual({ entry: 'seed' });
    expect((await firstYes('A landing page for a bakery; I have brand guidelines')).routes).toEqual({ entry: 'vision' });
    expect((await firstYes('A memo')).routes).toEqual({});
  });

  it('reads questions listed one per line', async () => {
    const out = await ask('advisor.intake', '- q-opts (routes to c2): Options?\n- q-page (routes to c1): A page?\n<problem>A homepage for my studio</problem>');
    expect(checkContract('advisor.intake', out, { questionIds: ['q-opts', 'q-page'] })).toEqual([]);
  });

  it('falls back to the protocol chooser ids when the prompt lists none', async () => {
    const out = await ask('advisor.intake', '<problem>A landing page for a bakery</problem>');
    expect(checkContract('advisor.intake', out, { questionIds: ['Q0', 'Q1', 'Q2', 'Q3', 'QF', 'Q4', 'Q5'] })).toEqual([]);
  });

  it.each(['advisor.compose', 'advisor.compose.repair'])('%s returns a composed recipe that validates', async (purpose) => {
    for (const problem of ['A short note to my team about Friday', 'A detailed RCA for the outage last week']) {
      const out = await ask(purpose, `<problem>${problem}</problem>`);
      expect(checkContract(purpose, out)).toEqual([]);
    }
  });

  it('adds the recipient-critic loop only for long documents', async () => {
    const short = JSON.parse(lastBlock(await ask('advisor.compose', '<problem>A short note</problem>'), 'json') as string);
    const long = JSON.parse(lastBlock(await ask('advisor.compose', '<problem>A detailed strategy report</problem>'), 'json') as string);
    expect(JSON.stringify(short)).not.toContain('recipient-loop');
    expect(JSON.stringify(long)).toContain('recipient-loop');
  });
  // Composing from the nearest recipe (prompt ids, exceptions, checkpoints kept) is covered in compose.test.ts.
});

/**
 * ENG-1: the mock reads a prompt's fenced blocks line by line, as the runner reads an answer's (the copy is held to the
 * runner's in scripts/test/fences-parity.test.ts). Before, a lazy regex cut a block at the first ``` anywhere.
 */
describe("the mock's fenced-block reader", () => {
  const T = '```';

  it('takes a fence named in the middle of a line for words, not for a block', () => {
    const prompt = `One fenced ${T}json block, shaped like this:\n\n    {"images":[]}\n\nThe current options:\n${T}json\n{"options":[]}\n${T}\n`;
    expect(fencedBlocks(prompt, ['json'])).toEqual(['{"options":[]}']);
  });

  it('reads a block that holds a fenced block with a language as one block, and the inner one as none of its own', () => {
    const doc = `# T\n\n${T}bash\nls\n${T}\n\nEnd.`;
    expect(fencedBlocks(`${T}markdown\n${doc}\n${T}`, ['markdown', 'bash', ''])).toEqual([doc]);
  });

  it('leaves out every top-level block whole, a block inside it included, when it reads the words outside them', () => {
    const prompt = `Images:\n![a](/api/artifacts/a)\n\n${T}markdown\n# T\n\n${T}bash\nls\n${T}\n\n![b](/api/artifacts/b)\n${T}\nAfter.`;
    expect(outsideFences(prompt)).toBe('Images:\n![a](/api/artifacts/a)\n\nAfter.');
  });

  it('reads the code change a prompt hands over whole when its diff adds a fenced block, with the Why inside the block or after it', async () => {
    const diff = ['--- a/README.md', '+++ b/README.md', '@@ -1,1 +1,4 @@', ' # Invoices', `+${T}bash`, '+pnpm test', `+${T}`].join('\n');
    const why = 'Why: document the test command.\n<!-- byway-demo-revision: 2 -->';
    const whole = `${T}diff\n${diff}\n${T}\n\n${why}`;
    // As the templates hand over a stored change: the artifact whole inside one diff block (the diff, a blank line, the
    // Why). A fix turn counts from the revision it was given, which only the Why paragraph carries.
    const stored = `The current change:\n\n${T}diff\n${diff}\n\n${why}\n\n${T}\n\nThe critique:\n\n- Name the command.`;
    expect(revisionOf(await ask('fix:code-diff', stored))).toBe(3);
    // As a model answers: the Why after the block.
    expect(revisionOf(await ask('fix:code-diff', `Fix this change.\n\n${whole}\n\nChange nothing else.`))).toBe(3);
  });
});
