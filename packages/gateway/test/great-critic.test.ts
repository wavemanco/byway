import { describe, expect, it } from 'vitest';
import { blindRanking, lineupOf, placeFor, type LineupItem } from '../src/mock/lineup.ts';
import { markProse, revisionOf, withoutMarks } from '../src/mock/revision.ts';
import { mockAdapter } from '../src/providers/mock.ts';
import type { ProviderAdapter, ProviderCompletionRequest } from '../src/providers/types.ts';
import { checkContract, lastBlock } from './contract.ts';

/**
 * The demo mock's GREAT critic (ADR-0072): told only "There are R references and 1 of ours (M items, labelled A–X)",
 * it critiques every item and ranks them all. It never learns which item is ours; it ranks by the demo revision
 * markers its own builders and fixes leave, and by what is new since the loop's first call, so demo loops converge.
 */

const LETTERS = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
const REFS = ['A crisp memo about hiring.', 'A memo about the office move.', 'A memo on Q3 numbers.', 'A memo about the new tool.', 'A memo about travel.', 'A memo about on-call.', 'A memo about the offsite.', 'A memo about pricing.', 'A memo about support hours.'];

function lineupPrompt(texts: string[]): string {
  const m = texts.length;
  const sections = texts.map((t, i) => `### ${LETTERS(m)[i]}\n${t}`).join('\n\n');
  return `GREAT mode. There are ${m - 1} references and 1 of ours (${m} items, labelled A–${LETTERS(m)[m - 1]}). Each piece is under its label:\n\n<lineup>\n${sections}\n</lineup>\n\nRank every item.`;
}

/** Puts `ours` at position `at` among the first n references. */
function withOurs(ours: string, n: number, at: number): string[] {
  const refs = REFS.slice(0, n);
  return [...refs.slice(0, at), ours, ...refs.slice(at)];
}

type Groups = { label: string; ids: string[] }[];

async function ask(adapter: ProviderAdapter, purpose: string, prompt: string, groups: Groups = [], runId = 'run-1', stepId = 'critic'): Promise<string> {
  const content: ProviderCompletionRequest['messages'][number]['content'] = [{ type: 'text', text: prompt }];
  for (const g of groups) {
    content.push({ type: 'text', text: `### ${g.label}` });
    for (const id of g.ids) content.push({ type: 'image', image: { artifactId: id, mediaType: 'image/png', base64: '' } });
  }
  const out = await adapter.complete({ model: 'mock-big', messages: [{ role: 'user', content }], maxOutputTokens: 4000, responseFormat: 'text', context: { workspaceId: 'ws', runId, stepId, purpose, profileId: 'demo' } });
  return out.text;
}

const rankingOf = (text: string) => (/^Ranking: (.+)$/m.exec(text.trim().split('\n').at(-1) ?? '')?.[1] ?? '').split(', ');
const placeOf = (text: string, label: string) => rankingOf(text).indexOf(label) + 1;

describe('mock GREAT critic: the answer', () => {
  it('critiques every item under its label and ranks every label once, best first', async () => {
    const out = await ask(mockAdapter(), 'critic:prose', lineupPrompt(withOurs('Our memo.', 4, 2)));
    expect(checkContract('critic:prose', out, { mode: 'GREAT', lineup: 5 })).toEqual([]);
    expect([...rankingOf(out)].sort()).toEqual(LETTERS(5));
    for (const label of LETTERS(5)) expect(out).toMatch(new RegExp(`^### ${label}\\n- Intent: `, 'm'));
    // It answers with labels only: nothing says which item it took to be ours.
    expect(out).not.toMatch(/\bours\b|our (?:item|piece|draft)/i);
  });

  it('reads M and the labels from the lineup line, with no "### X" sections at all', async () => {
    const out = await ask(mockAdapter(), 'critic:web-page', 'GREAT mode. There are 6 references and 1 of ours (7 items, labelled A–G).');
    expect([...rankingOf(out)].sort()).toEqual(LETTERS(7));
    expect(lineupOf('There are 3 references and 1 of ours (4 items, labelled A–D).')).toEqual({ refs: 3, size: 4, labels: LETTERS(4) });
    expect(lineupOf('You are reviewing one piece of writing.')).toBeUndefined();
  });

  it('keeps OK mode unchanged: bullets, then "Score: N/10"', async () => {
    const out = await ask(mockAdapter(), 'critic:prose', 'You are reviewing one piece of writing:\n\n<piece>\nThe memo.\n</piece>');
    expect(out.trim().split('\n').at(-1)).toMatch(/^Score: \d+\/10$/);
    expect(checkContract('critic:prose', out, { mode: 'OK' })).toEqual([]);
  });
});

describe('mock GREAT critic: blind ranking by revision', () => {
  it('places a marked revision by its number, wherever it sits in the lineup', async () => {
    for (const [revision, place] of [[1, 9], [2, 5], [3, 1]] as const) {
      const ours = markProse('# Our memo\n\nThe point.', revision);
      for (const at of [0, 4, 9]) {
        const out = await ask(mockAdapter(), 'critic:prose', lineupPrompt(withOurs(ours, 9, at)));
        expect(placeOf(out, LETTERS(10)[at] as string), `revision ${revision} at ${at}`).toBe(place);
      }
    }
    expect([1, 2, 3].map((r) => placeFor(r, 5))).toEqual([4, 2, 1]);
  });

  it('orders unmarked items (the references) by a stable hash of their content, not by their label', () => {
    const items = (order: number[]): LineupItem[] => order.map((k, i) => ({ label: LETTERS(4)[i] as string, text: REFS[k] as string, images: [] }));
    const byText = (order: number[]) => blindRanking(items(order)).map((l) => REFS[order[LETTERS(4).indexOf(l)] as number]);
    expect(byText([0, 1, 2, 3])).toEqual(byText([3, 1, 0, 2]));
  });

  it('a demo C3/C4 loop converges: build, critic, fix, critic… reaches rank 3 or better within three rounds', async () => {
    for (const refs of [9, 4]) {
      const adapter = mockAdapter();
      let draft = lastBlock(await ask(adapter, 'build:prose', '<problem>A status update memo for leadership on the billing migration</problem>', [], 'run-c', 'draft'), 'markdown') as string;
      const places: number[] = [];
      for (let round = 0; round < 3; round++) {
        const at = (round * 3) % (refs + 1);
        const out = await ask(adapter, 'critic:prose', lineupPrompt(withOurs(draft, refs, at)), [], 'run-c', 'critic');
        places.push(placeOf(out, LETTERS(refs + 1)[at] as string));
        draft = lastBlock(await ask(adapter, 'fix:prose', `Critique:\n${out}\n\n\`\`\`markdown\n${draft}\n\`\`\``, [], 'run-c', 'revise'), 'markdown') as string;
      }
      expect(places, `${refs} references`).toEqual(refs === 9 ? [9, 5, 1] : [4, 2, 1]);
    }
  });

  it('a demo C7 loop converges on diffs the same way', async () => {
    const adapter = mockAdapter();
    let answer = await ask(adapter, 'build:code-diff', '<problem>Trim this agent-written refactor of the invoice formatter</problem>', [], 'run-d', 'implement');
    const view = (a: string) => `${lastBlock(a, 'diff')}\n\n${a.slice(a.lastIndexOf('```') + 3).trim()}`;
    const places: number[] = [];
    for (let round = 0; round < 3; round++) {
      const out = await ask(adapter, 'critic:code-diff', lineupPrompt(withOurs(view(answer), 4, 1)), [], 'run-d', 'reviewer');
      places.push(placeOf(out, 'B'));
      answer = await ask(adapter, 'fix:code-diff', `Critique:\n${out}\n\n${answer}`, [], 'run-d', 'review-fix');
      expect(checkContract('fix:code-diff', answer)).toEqual([]);
    }
    expect(places).toEqual([4, 2, 1]);
  });

  it('image-only lineups: the item whose screenshots are new rises, shuffles agree, and references keep their order', async () => {
    const adapter = mockAdapter();
    const refs = ['sha256:r1', 'sha256:r2', 'sha256:r3', 'sha256:r4'];
    const call = async (ours: string, at: number) => {
      const ids = [...refs.slice(0, at), ours, ...refs.slice(at)];
      const groups = ids.map((id, i) => ({ label: LETTERS(5)[i] as string, ids: [`${id}-wide`, `${id}-phone`] }));
      const out = await ask(adapter, 'critic:web-page', 'GREAT mode. There are 4 references and 1 of ours (5 items, labelled A–E).', groups, 'run-p', 'critic');
      const ranking = rankingOf(out);
      const refOrder = ranking.map((l) => ids[LETTERS(5).indexOf(l)]).filter((id) => id !== ours);
      return { place: placeOf(out, LETTERS(5)[at] as string), refOrder };
    };
    // Round 1, two shuffles: the first call is the baseline, so ours is placed by its hash, the same both times.
    const r1a = await call('sha256:ours-1', 2);
    const r1b = await call('sha256:ours-1', 4);
    expect(r1b.place).toBe(r1a.place);
    // Round 2: new screenshots of ours (the only item that changed) count as a revision: place 2 of 5, in both shuffles.
    const r2a = await call('sha256:ours-2', 0);
    const r2b = await call('sha256:ours-2', 3);
    expect([r2a.place, r2b.place]).toEqual([2, 2]);
    // Round 3: newer still, so first.
    const r3 = await call('sha256:ours-3', 1);
    expect(r3.place).toBe(1);
    // The references never changed, so their order among themselves never did.
    for (const r of [r1b, r2a, r2b, r3]) expect(r.refOrder).toEqual(r1a.refOrder);
  });
});

describe('demo revision markers', () => {
  it('prose: new work is revision 1, a fix adds one, asset.integrate keeps it; the marker is a Markdown comment', async () => {
    const adapter = mockAdapter();
    const built = lastBlock(await ask(adapter, 'build:prose', '<problem>A memo on the billing migration</problem>'), 'markdown') as string;
    expect(revisionOf(built)).toBe(1);
    expect(built).toMatch(/\n\[\/\/\]: # \(byway-demo-revision: 1\)$/);
    const fixed = lastBlock(await ask(adapter, 'fix:prose', `Critique:\n- Shorter.\n\n\`\`\`markdown\n${built}\n\`\`\``), 'markdown') as string;
    expect(revisionOf(fixed)).toBe(2);
    expect(fixed.match(/byway-demo-revision/g)).toHaveLength(1);
    const integrated = lastBlock(await ask(adapter, 'asset.integrate:prose', `Images:\n![A chart](/api/artifacts/sha256:${'a'.repeat(64)})\n\n\`\`\`markdown\n${fixed}\n\`\`\``), 'markdown') as string;
    expect(revisionOf(integrated)).toBe(2);
    expect(withoutMarks(integrated)).not.toContain('byway-demo-revision');
  });

  it('code diffs: the marker sits in the Why paragraph, and the answer still meets the contract', async () => {
    const adapter = mockAdapter();
    const built = await ask(adapter, 'build:code-diff', '<problem>Trim this refactor</problem>');
    expect(checkContract('build:code-diff', built)).toEqual([]);
    expect(built.trim().split('\n').at(-1)).toBe('<!-- byway-demo-revision: 1 -->');
    const fixed = await ask(adapter, 'fix:code-diff', `Critique:\n- Smaller.\n\n${built}`);
    expect(revisionOf(fixed)).toBe(2);
  });
});
