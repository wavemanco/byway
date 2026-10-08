import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CheckpointRecord } from '@byway/contracts';
import { checkResolution } from '../src/resolution.ts';

type Target = Pick<CheckpointRecord, 'id' | 'kind' | 'options' | 'k'>;

const options = [
  { id: 'A', label: 'A' },
  { id: 'B', label: 'B' },
  { id: 'C', label: 'C' },
];

describe('checkResolution', () => {
  it('is importable from workflow code: no runtime imports at all', () => {
    const source = readFileSync(new URL('../src/resolution.ts', import.meta.url), 'utf8');
    const imports = source.split('\n').filter((l) => /^\s*import\s/.test(l));
    expect(imports.every((l) => /^\s*import type\s/.test(l))).toBe(true);
  });

  it('normalizes each kind to its one field', () => {
    const cases: [Target, object, object][] = [
      [{ id: 'p', kind: 'pick', options, k: 2 }, { choice: ['B', 'A'], text: 'x' }, { choice: ['B', 'A'] }],
      [{ id: 'c', kind: 'choose', options }, { choice: ['C'] }, { choice: ['C'] }],
      [{ id: 'm', kind: 'compare', options }, { choice: ['A'], approved: true }, { choice: ['A'] }],
      [{ id: 'y', kind: 'confirm' }, { approved: true, choice: ['A'] }, { approved: true }],
      [{ id: 'r', kind: 'react' }, { text: 'Warmer, less corporate' }, { text: 'Warmer, less corporate' }],
      [{ id: 'w', kind: 'write' }, { text: '' }, { text: '' }],
      [{ id: 'd', kind: 'directive' }, { text: '- Drop the FAQ' }, { text: '- Drop the FAQ' }],
    ];
    for (const [cp, res, expected] of cases) {
      expect(checkResolution(cp, { checkpointId: cp.id, ...res })).toEqual({ ok: true, resolution: { checkpointId: cp.id, ...expected } });
    }
  });

  it('accepts any choice when the checkpoint lists no options, and any number of options when pick has no k', () => {
    expect(checkResolution({ id: 'c', kind: 'choose' }, { checkpointId: 'c', choice: ['explore'] }).ok).toBe(true);
    expect(checkResolution({ id: 'p', kind: 'pick', options }, { checkpointId: 'p', choice: ['A', 'B', 'C'] }).ok).toBe(true);
    expect(checkResolution({ id: 'p', kind: 'pick', options }, { checkpointId: 'p', choice: ['B'] }).ok).toBe(true);
  });

  it('pick: exactly k distinct, known options (the contract), no fewer and no more', () => {
    const pick = (k: number, choice: string[], opts: Target['options'] | null = options) => checkResolution({ id: 'p', kind: 'pick', ...(opts ? { options: opts } : {}), k }, { checkpointId: 'p', choice });
    expect(pick(1, ['B'])).toEqual({ ok: true, resolution: { checkpointId: 'p', choice: ['B'] } });
    expect(pick(2, ['C', 'A']).ok).toBe(true);
    expect(pick(3, ['A', 'B', 'C']).ok).toBe(true);
    for (const [k, choice] of [[2, ['A']], [2, ['A', 'B', 'C']], [3, ['A', 'B']], [1, ['A', 'B']]] as const) {
      expect(pick(k, [...choice]).ok, `k=${k} ${choice.join()}`).toBe(false);
    }
    // Two entries that name one option are one option, not two.
    expect(pick(2, ['A', 'A']).ok).toBe(false);
    expect(pick(2, ['A', 'Q']).ok).toBe(false);
    // Without listed options the ids cannot be checked, but the count still can.
    expect(pick(2, ['x', 'y'], null).ok).toBe(true);
    expect(pick(2, ['x'], null).ok).toBe(false);
  });

  it('select: any distinct subset of the listed options, including none (TELLS hits decided per instance)', () => {
    const select = (choice: unknown[], opts: Target['options'] | null = options) =>
      checkResolution({ id: 's', kind: 'select', ...(opts ? { options: opts } : {}) }, { checkpointId: 's', choice: choice as string[] });
    expect(select([])).toEqual({ ok: true, resolution: { checkpointId: 's', choice: [] } });
    expect(select(['B'])).toEqual({ ok: true, resolution: { checkpointId: 's', choice: ['B'] } });
    expect(select(['C', 'A'])).toEqual({ ok: true, resolution: { checkpointId: 's', choice: ['C', 'A'] } });
    expect(select(['A', 'B', 'C']).ok).toBe(true);
    // Choosing none is an answer; sending no choice at all is not.
    expect(checkResolution({ id: 's', kind: 'select', options }, { checkpointId: 's' }).ok).toBe(false);
    expect(checkResolution({ id: 's', kind: 'select', options }, { checkpointId: 's', text: 'none' }).ok).toBe(false);
    expect(select(['A', 'A']).ok).toBe(false);
    expect(select(['Q']).ok).toBe(false);
    expect(select([1]).ok).toBe(false);
    // Other fields are dropped, as for every kind.
    expect(checkResolution({ id: 's', kind: 'select', options }, { checkpointId: 's', choice: [], approved: true })).toEqual({ ok: true, resolution: { checkpointId: 's', choice: [] } });
  });

  it('explains what is wrong', () => {
    const problem = (cp: Target, res: object): string => {
      const r = checkResolution(cp, { checkpointId: cp.id, ...res });
      return r.ok ? '' : r.problem;
    };
    expect(problem({ id: 'p', kind: 'pick', options, k: 1 }, { choice: ['A', 'B'] })).toBe('checkpoint "p" (pick): `choice` picks 2 options; exactly 1 must be picked');
    expect(problem({ id: 'p', kind: 'pick', options, k: 2 }, { choice: ['A'] })).toBe('checkpoint "p" (pick): `choice` picks 1 option; exactly 2 must be picked');
    expect(problem({ id: 'p', kind: 'pick', options }, { choice: ['Q'] })).toContain('unknown options "Q"');
    expect(problem({ id: 'p', kind: 'pick', options }, { choice: ['A', 'A'] })).toContain('twice');
    expect(problem({ id: 'p', kind: 'pick', options }, { choice: [1] })).toContain('non-empty list');
    expect(problem({ id: 'c', kind: 'choose', options }, { choice: ['A', 'B'] })).toContain('exactly one');
    expect(problem({ id: 's', kind: 'select', options }, {})).toBe('checkpoint "s" (select): needs `choice`: a list of option ids (it may be empty)');
    expect(problem({ id: 's', kind: 'select', options }, { choice: ['A', 'A'] })).toContain('twice');
    expect(problem({ id: 'y', kind: 'confirm' }, { approved: 'yes' })).toContain('`approved`');
    expect(problem({ id: 'w', kind: 'write' }, {})).toContain('`text`');
  });

  it('refuses a resolution addressed to another checkpoint', () => {
    expect(checkResolution({ id: 'a', kind: 'confirm' }, { checkpointId: 'b', approved: true })).toEqual({ ok: false, problem: 'checkpoint "a" (confirm): the resolution names checkpoint "b"' });
  });
});
