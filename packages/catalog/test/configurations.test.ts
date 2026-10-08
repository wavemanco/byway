/**
 * Structure checks for the protocol configurations C2–C7 and C6a against 03-configurations: their exceptions,
 * sit-outs, media, prompts, and the wiring details each section states. Validation, exception need and drift are
 * covered for every catalog recipe in conformance.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_CODES, EXCEPTIONS, OPTION_SET } from '@byway/protocol';
import { steps, walk, walkNode, type Node, type Recipe, type Step } from '@byway/recipe';
import { validate } from '@byway/validator';
import { CATALOG, PROTOCOL_CONFIGS, c2, c3, c4, c5, c6, c6a, c7 } from '../src/index.ts';

const NEW = [c2, c3, c4, c5, c6, c6a, c7];

function nodes<T extends Node['op']>(r: Recipe, op: T): Extract<Node, { op: T }>[] {
  const out: Node[] = [];
  walk(r, (n) => {
    if (n.op === op) out.push(n);
  });
  return out as Extract<Node, { op: T }>[];
}
const stepById = (r: Recipe, id: string): Step => {
  const s = steps(r).find(({ step }) => step.id === id)?.step;
  if (!s) throw new Error(`${r.id} has no step ${id}`);
  return s;
};
const blocksUsed = (r: Recipe) => new Set(steps(r).flatMap(({ step }) => (step.block ? [step.block] : [])));

describe('the eight protocol configurations', () => {
  it('are in the catalog on the protocol channel, one per family, in 03 order', () => {
    expect(PROTOCOL_CONFIGS.map((r) => [r.id, r.family, r.kind, r.channel])).toEqual([
      ['c1', 'C1', 'protocol-config', 'protocol'],
      ['c2', 'C2', 'protocol-config', 'protocol'],
      ['c3', 'C3', 'protocol-config', 'protocol'],
      ['c4', 'C4', 'protocol-config', 'protocol'],
      ['c5', 'C5', 'protocol-config', 'protocol'],
      ['c6', 'C6', 'protocol-config', 'protocol'],
      ['c6a', 'C6a', 'protocol-config', 'protocol'],
      ['c7', 'C7', 'protocol-config', 'protocol'],
    ]);
    for (const r of PROTOCOL_CONFIGS) expect(CATALOG).toContain(r);
  });

  it('each has its medium', () => {
    expect(Object.fromEntries(PROTOCOL_CONFIGS.map((r) => [r.id, r.medium]))).toEqual({
      c1: 'web-page', c2: 'options', c3: 'prose', c4: 'prose', c5: 'media', c6: 'prose', c6a: 'prose', c7: 'code-diff',
    });
  });

  it('cite exactly the exceptions of the 03 table (C3 declares none)', () => {
    expect(Object.fromEntries(NEW.map((r) => [r.id, r.exceptions]))).toEqual({
      c2: ['C2-DR4', 'C2-DR7'],
      c3: [],
      c4: ['C4-DR9'],
      c5: ['C5-DR7'],
      c6: ['C6-DR4', 'C6-DR7'],
      c6a: ['C6a-DR4', 'C6a-DR7'],
      c7: ['C7-PR1', 'C7-DR7'],
    });
    for (const r of NEW) for (const ex of r.exceptions) expect(EXCEPTIONS[ex]?.scope, `${r.id} ${ex}`).toBe('protocol-declared');
  });

  it('sit out exactly the blocks 03 marks "—", and use every other block', () => {
    expect(Object.fromEntries(NEW.map((r) => [r.id, r.sitsOut.map((s) => s.block).sort()]))).toEqual({
      c2: ['CUT', 'RELAY', 'TELLS'],
      c3: ['RELAY'],
      c4: ['ASSET', 'RELAY', 'SEED'],
      c5: [],
      c6: ['ASSET', 'RELAY', 'SEED'],
      c6a: ['ASSET', 'RELAY'],
      c7: ['ASSET', 'RELAY', 'SEED'],
    });
    for (const r of NEW) {
      const used = blocksUsed(r);
      for (const block of BLOCK_CODES) expect(used.has(block) || r.sitsOut.some((s) => s.block === block), `${r.id} ${block}`).toBe(true);
      for (const s of r.sitsOut) expect(s.reason.length, `${r.id} ${s.block}`).toBeGreaterThan(10);
    }
  });

  it('run project prompts product.<config>.<step-id> on every model step, and none on human or tool steps', () => {
    for (const r of NEW) {
      for (const { step } of steps(r)) {
        if (step.actor === 'model') expect(step.prompt, `${r.id} ${step.id}`).toBe(`product.${r.id}.${step.id}`);
        else expect(step.prompt, `${r.id} ${step.id}`).toBeUndefined();
      }
    }
  });

  it('give every TELLS sweep the catalog of its domain', () => {
    const domains = (r: Recipe) => [...new Set(steps(r).filter(({ step }) => step.role === 'tells-sweep').map(({ step }) => JSON.stringify(step.knobs?.domains)))];
    expect(Object.fromEntries(NEW.map((r) => [r.id, domains(r)]))).toEqual({
      c2: [],
      c3: [JSON.stringify(['prose-words', 'prose-structure', 'newsletter', 'social'])],
      c4: [JSON.stringify(['memo'])],
      c5: [JSON.stringify(['media-style'])],
      c6: [JSON.stringify(['application'])],
      c6a: [JSON.stringify(['fiction'])],
      c7: [JSON.stringify(['code'])],
    });
  });

  it('every one has a human checkpoint and banks failed prompts', () => {
    for (const r of PROTOCOL_CONFIGS) {
      expect(steps(r).some(({ step }) => step.actor === 'human') || nodes(r, 'pick').some((p) => p.actor === 'human'), r.id).toBe(true);
      expect(r.bank, r.id).toBe(true);
    }
  });

  it('give every rank gate a critic that names its reference count, so the runner can scale the bar to the lineup (GATE-1, C6)', () => {
    // A rank threshold is written for a lineup of refs + 1. A run with fewer references gets a smaller lineup, and the
    // runner passes rank <= max(1, floor(threshold × lineup / (refs + 1))): the bar keeps its share of the lineup.
    const critics = (n: Node): Step[] => {
      const out: Step[] = [];
      walkNode(n, '', 'D1', (x) => {
        if (x.op === 'step' && x.role === 'critic') out.push(x);
      });
      return out;
    };
    let gates = 0;
    for (const r of PROTOCOL_CONFIGS) {
      walk(r, (n) => {
        const ranked = (n.op === 'loop' && n.gate.metric === 'critic-rank') || (n.op === 'gate' && n.pass.metric === 'critic-rank');
        if (!ranked) return;
        gates++;
        const [critic, ...more] = critics(n.body);
        expect(more, `${r.id} ${n.id}`).toEqual([]);
        expect(critic?.knobs?.refs, `${r.id} ${n.id}: the critic's refs knob`).toEqual(expect.any(Number));
      });
    }
    expect(gates).toBe(4);
  });

  it('validate on their own with no warnings', () => {
    for (const r of NEW) expect(validate(r).warnings, r.id).toEqual([]);
  });
});

describe('C2 Divergence Engine', () => {
  it('is D1-only: 8–20 seeded options, dedupe, an annotation-only audit, the human decides, VOICE names it', () => {
    expect(c2.stages.map((s) => s.stage)).toEqual(['D1']);
    const [seeded] = nodes(c2, 'replicate');
    expect(seeded?.n).toBeGreaterThanOrEqual(8);
    expect(seeded?.n).toBeLessThanOrEqual(20);
    expect(stepById(c2, 'dedupe')).toMatchObject({ role: 'dedupe', glue: 'dedupe', consumes: [OPTION_SET], produces: [OPTION_SET] });
    const [annotate] = nodes(c2, 'audit');
    expect(annotate?.lenses.map((l) => l.name)).toEqual(['vanilla-overlap', 'critic']);
    expect(nodes(c2, 'pick')).toEqual([]);
    expect(stepById(c2, 'voice')).toMatchObject({ actor: 'human', block: 'VOICE' });
  });

  it('keeps mood boards rough and out of the work: ASSET makes an asset and writes nothing', () => {
    expect(stepById(c2, 'mood-boards')).toMatchObject({ block: 'ASSET', produces: ['asset'] });
    expect(stepById(c2, 'mood-boards').writes).toBeUndefined();
  });
});

describe('C3 Voice Series (one piece)', () => {
  it('seeds six angles, flags vanilla overlap, and the human picks an angle and states the thesis', () => {
    expect(nodes(c3, 'replicate').map((r) => r.n)).toEqual([6, 3]);
    expect(nodes(c3, 'pick').map((p) => [p.mode, p.k, p.actor])).toEqual([['H', 1, 'human']]);
    expect(stepById(c3, 'thesis')).toMatchObject({ actor: 'human', block: 'VISION', produces: ['brief'] });
  });

  it('drafts by the worker or by you, then a different-family critic ranks it in the top 3 of 10, probe 1, max 3', () => {
    expect(nodes(c3, 'route').map((r) => [r.id, r.branches.map((b) => b.name)])).toEqual([['draft', ['ai', 'own']]]);
    const [loop] = nodes(c3, 'loop');
    expect(loop?.gate).toMatchObject({ metric: 'critic-rank', threshold: 3, hidden: true, probe: 1, max: 3 });
    expect(stepById(c3, 'critic').knobs).toMatchObject({ mode: 'GREAT', refs: 9, family: 'other' });
  });

  it('ends with the human-judged Distill and VOICE on every line', () => {
    const d3 = steps(c3).filter(({ stage }) => stage === 'D3').map(({ step }) => step.block ?? step.role);
    expect(d3).toEqual(['render', 'CUT', 'fix', 'render', 'TELLS', 'fix', 'render', 'TELLS', 'VOICE']);
    expect(stepById(c3, 'voice').knobs).toEqual({ scope: 'every-line' });
  });
});

describe('C4 Reader-Ready', () => {
  it('opens with your one-line direction; the recipient critic runs only for long documents, at most 2 rounds', () => {
    expect(stepById(c4, 'vision-lite')).toMatchObject({ actor: 'human', variant: 'VISION-lite', produces: ['brief'] });
    const [critic] = nodes(c4, 'optional').filter((o) => o.id === 'recipient-critic');
    expect(critic?.trigger).toMatch(/300 words/);
    expect(critic?.body.op === 'loop' && critic.body.gate).toMatchObject({ metric: 'critic-rank', threshold: 3, max: 2 });
  });

  it('uses VOICE-lite on the key lines, then an optional claim-log sign-off', () => {
    expect(stepById(c4, 'voice')).toMatchObject({ variant: 'VOICE-lite', knobs: { scope: 'key-lines' } });
    const claims = nodes(c4, 'optional').find((o) => o.id === 'claim-log');
    expect(claims?.trigger).toMatch(/fact-heavy/);
    expect(stepById(c4, 'claim-sign-off')).toMatchObject({ actor: 'human', block: 'VOICE', variant: 'claim-log' });
  });

  it("writes the owner's claim corrections back into the memo: the sign-off produces the artifact (ENG-2)", () => {
    // The owner is asked to correct any claim that is wrong; a sign-off that produced only `voice` dropped every
    // correction, and the memo shipped with the numbers the owner had fixed.
    const signOff = stepById(c4, 'claim-sign-off');
    expect(signOff).toMatchObject({ consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true });
    expect(validate(c4).ok).toBe(true);
  });
});

describe('C5 Media Relay', () => {
  it('uses all eight blocks', () => {
    expect([...blocksUsed(c5)].sort()).toEqual([...BLOCK_CODES].sort());
  });

  it('locks the VO script in D1 right after the concept pick (VOICE-early)', () => {
    const d1 = steps(c5).filter(({ stage }) => stage === 'D1').map(({ step }) => step.id);
    expect(d1.at(-1)).toBe('vo-script');
    expect(stepById(c5, 'vo-script')).toMatchObject({ actor: 'human', variant: 'VOICE-early' });
    expect(nodes(c5, 'pick').map((p) => [p.id, p.k])).toEqual([['shortlist', 3], ['pick-concept', 1]]);
  });

  it('chains clips, each starting from the last frame, with per-shot defect repair (at most 2 regenerations)', () => {
    const [chain] = nodes(c5, 'relay');
    expect(chain?.maxLinks).toBe(4);
    expect(stepById(c5, 'clip')).toMatchObject({ block: 'RELAY', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], knobs: { effect: 'transition-B1' } });
    const repair = nodes(c5, 'loop').find((l) => l.id === 'shot-repair');
    expect(repair?.gate).toMatchObject({ metric: 'check-clean', max: 3 });
  });

  it('keeps the locked voice verbatim in every later machine write', () => {
    let voiced = false;
    for (const { step } of steps(c5)) {
      if (voiced && step.writes && step.actor !== 'human') expect(step.keepsVoice, step.id).toBe(true);
      if (step.produces.includes('voice')) voiced = true;
    }
  });

  it('ends with a one-shot gate after D3: rank at or above the median, two fixed shuffles, one automatic retry of D2', () => {
    const [gate] = nodes(c5, 'gate');
    expect(gate).toMatchObject({ pass: { metric: 'critic-rank', threshold: 3, hidden: true }, retry: { stage: 'D2', times: 1 }, onFail: 'human' });
    expect(stepById(c5, 'gate-critic').knobs).toMatchObject({ refs: 4, shuffles: 2 });
    const last = c5.stages.at(-1)!.body;
    expect(last.op === 'seq' && last.steps.at(-1)?.op).toBe('gate');
  });
});

describe.each([
  ['C6', c6, 'application'],
  ['C6a', c6a, 'fiction'],
] as const)('%s inverted authorship', (_name, r, domain) => {
  it('the human writes every sentence: from your first draft on, every step that writes the work is yours', () => {
    const all = steps(r);
    const first = all.findIndex(({ step }) => step.id === 'write');
    expect(all[first]?.step).toMatchObject({ actor: 'human', writes: true });
    expect(all[first]?.step.consumes).not.toContain('artifact');
    for (const { step } of all.slice(first)) if (step.writes) expect(step.actor, step.id).toBe('human');
  });

  it('three annotation-only auditors read each draft, in a loop the human ends', () => {
    const loop = nodes(r, 'loop').find((l) => l.id === 'author-loop');
    expect(loop?.gate).toMatchObject({ metric: 'human', holder: 'human' });
    const audit = nodes(r, 'audit').find((a) => a.id === 'audit');
    expect(audit?.lenses.map((l) => l.name)).toEqual(['cut', 'tells', 'critic']);
    expect(stepById(r, 'tells-flags').knobs).toMatchObject({ domains: [domain] });
    expect(stepById(r, 'critic').knobs).toMatchObject({ mode: 'GREAT', refs: 4, family: 'other' });
  });

  it('VOICE is the whole text, written by you', () => {
    expect(stepById(r, 'voice')).toMatchObject({ actor: 'human', knobs: { scope: 'every-line' } });
  });
});

describe('C6a front end', () => {
  it('seeds six premise/form cards, flags vanilla overlap, and you pick, react and sharpen a brief for yourself', () => {
    expect(nodes(c6a, 'replicate').map((r) => r.n)).toEqual([6, 3]);
    expect(nodes(c6a, 'pick').map((p) => [p.mode, p.k])).toEqual([['H', 1]]);
    expect(nodes(c6a, 'loop').find((l) => l.id === 'vision')?.gate).toMatchObject({ metric: 'human', max: 2 });
    expect(stepById(c6a, 'write').consumes).toContain('brief');
  });

  it('offers an optional, flags-only final TELLS read after VOICE', () => {
    const final = nodes(c6a, 'optional').find((o) => o.id === 'final-tells-read');
    expect(final?.body.op).toBe('audit');
    expect(stepById(c6a, 'final-tells-flags').knobs).toMatchObject({ domains: ['fiction'] });
  });
});

describe('C7 Lean Diff', () => {
  it('trims scope before the review loop and review bloat after it, both in D2', () => {
    const d2 = steps(c7).filter(({ stage }) => stage === 'D2').map(({ step }) => step.id);
    expect(d2.indexOf('scope-cut')).toBeLessThan(d2.indexOf('reviewer'));
    expect(d2.indexOf('bloat-cut')).toBeGreaterThan(d2.indexOf('reviewer'));
    expect(stepById(c7, 'scope-cut')).toMatchObject({ block: 'CUT', actor: 'model' });
  });

  it('reviews blind on reviewability: rank at or above the median of 4 merged PRs, probe 1, max 3, another family', () => {
    const review = nodes(c7, 'loop').find((l) => l.id === 'review-loop');
    expect(review?.gate).toMatchObject({ metric: 'critic-rank', threshold: 3, probe: 1, max: 3 });
    expect(stepById(c7, 'reviewer').knobs).toMatchObject({ refs: 4, family: 'other' });
  });

  it('runs the objective-defect checks before CUT, and ends with your TELLS triage and the PR why', () => {
    expect(stepById(c7, 'defect-check')).toMatchObject({ role: 'check', actor: 'model' });
    const d3 = steps(c7).filter(({ stage }) => stage === 'D3').map(({ step }) => step.block ?? step.role);
    expect(d3).toEqual(['render', 'TELLS', 'fix', 'render', 'TELLS', 'VOICE']);
  });
});
