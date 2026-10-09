/**
 * Optional reads (ADR-0089). A model step's `reads` are ports it takes when they are there, as C7's implement takes the
 * brief the optional spec interview may have written. Scope typing holds each one to `may` (some path makes it) and
 * never to `must`; the port rules hold a read as they hold a consumed port (PR1, PR3, PR5, PR7.1); and only a model
 * step reads optionally, since only a model prompt has a slot to leave empty.
 */
import { describe, expect, it } from 'vitest';
import type { PortType } from '@byway/protocol';
import { loop, optional, seq, step, type Node, type Recipe, type Step } from '@byway/recipe';
import { validate, type Verdict } from '../src/index.ts';

const ids = (v: Verdict) => [...new Set(v.violations.map((x) => x.ruleId))].sort();

const interview = step({ id: 'interview', role: 'vision', block: 'VISION', actor: 'model', tier: 'mid', prompt: 'product.c7.interview', consumes: ['intent'], produces: ['brief'] });
const spec = step({ id: 'spec', role: 'vision', block: 'VISION', actor: 'human', consumes: ['brief'], produces: ['brief'], variant: 'VISION-lite' });
const implement = (extra: Partial<Step> = {}): Step =>
  step({ id: 'implement', role: 'build', actor: 'model', tier: 'mid', prompt: 'product.c7.implement', consumes: ['intent'], produces: ['artifact'], writes: true, ...extra });

/** An experimental recipe (default rules off): an optional spec interview in D1, then `d2`. */
function recipe(d2: Node, d1: Node = optional('spec-interview', 'the requirements are vague', seq(interview, spec))): Recipe {
  return {
    schema: 'byway.recipe/1',
    id: 'reads',
    title: 'Reads',
    kind: 'experimental',
    family: 'C7',
    channel: 'workspace',
    medium: 'code-diff',
    inputs: ['intent'],
    stages: [
      { stage: 'D1', body: d1 },
      { stage: 'D2', body: d2 },
    ],
    sitsOut: [],
    exceptions: [],
    bank: false,
  };
}

describe('scope typing of optional reads (ST5)', () => {
  it('a model step may read a port an optional branch may have made', () => {
    expect(validate(recipe(implement({ reads: ['brief'] }))).violations).toEqual([]);
  });

  it('consuming that port instead is refused: it is not in scope on every path', () => {
    expect(ids(validate(recipe(implement({ consumes: ['intent', 'brief'] }))))).toEqual(['ST5']);
  });

  it('a read of a port no path makes before it is refused', () => {
    const v = validate(recipe(implement({ reads: ['taste'] })));
    expect(ids(v)).toEqual(['ST5']);
    expect(v.violations[0]!.message).toBe('step "implement" reads taste, which no path makes before it');
  });

  it('a port both consumed and read is refused', () => {
    const v = validate(recipe(implement({ consumes: ['intent'], reads: ['intent'] })));
    expect(ids(v)).toEqual(['ST5']);
    expect(v.violations[0]!.message).toMatch(/both consumes and reads intent/);
  });

  it('only a model step reads optionally', () => {
    const human = step({ id: 'react', role: 'vision', block: 'VISION', actor: 'human', consumes: ['intent'], reads: ['brief'], produces: ['taste'] });
    const v = validate(recipe(seq(human, implement())));
    expect(ids(v)).toEqual(['ST5']);
    expect(v.violations[0]!.message).toMatch(/only a model step reads optionally/);
  });

  it('a read never makes a port required: a later consumer of it is still refused', () => {
    const later = step({ id: 'polish', role: 'fix', actor: 'model', tier: 'mid', prompt: 'p', consumes: ['brief', 'artifact'], produces: ['artifact'], writes: true });
    const v = validate(recipe(seq(implement({ reads: ['brief'] }), later)));
    expect(v.violations.map((x) => x.message)).toEqual(['step "polish" consumes brief, which is not in scope on every path']);
  });

  it('is typed on the first round only: a read of a port first made later in the same loop body is refused (documented limit)', () => {
    const gate = { metric: 'human', hidden: false, holder: 'human' as const, probe: 1, max: 2, onCap: 'human' as const, onNoConverge: 'recalibrate-human' as const };
    const sharpen = step({ id: 'sharpen', role: 'vision', block: 'VISION', actor: 'model', tier: 'mid', prompt: 'p', consumes: ['artifact'], produces: ['taste'] });
    const body = loop('rounds', seq(implement({ reads: ['taste'] }), sharpen), gate);
    const v = validate(recipe(body, seq(interview)));
    expect(v.violations.map((x) => x.message)).toEqual(['step "implement" reads taste, which no path makes before it']);
  });
});

describe('the port rules hold a read as they hold a consumed port', () => {
  const judged = (reads: PortType[], role: Step['role'] = 'critic'): Verdict => {
    const render = step({ id: 'render', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
    const critic = step({ id: 'judge', role, ...(role === 'critic' ? { block: 'CRITIC' as const } : {}), actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p', consumes: ['view'], reads, produces: ['critique'] });
    return validate(recipe(seq(implement(), render, critic)));
  };

  it('PR1 and PR5: a judge reading the brief', () => {
    expect(ids(judged(['brief']))).toEqual(['PR1', 'PR5']);
    expect(ids(judged(['brief'], 'check'))).toEqual(['PR1', 'PR5']);
  });

  it('PR3: a builder reading the seed; PR7.1: a fix reading the tell catalog', () => {
    const seedRecipe = recipe(implement({ reads: ['seed'] }), seq(step({ id: 'spark', role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', prompt: 'p', consumes: ['intent'], produces: ['seed'] })));
    expect(ids(validate(seedRecipe))).toContain('PR3');
    const tells = recipe(seq(implement(), step({ id: 'swap', role: 'fix', actor: 'model', tier: 'mid', prompt: 'p', consumes: ['artifact'], reads: ['tells'], produces: ['artifact'], writes: true })));
    tells.inputs.push('tells');
    expect(ids(validate(tells))).toContain('PR7.1');
  });
});
