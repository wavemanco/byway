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

  it('accepts any choice when the checkpoint lists no options, and up to the whole list when pick has no k', () => {
    expect(checkResolution({ id: 'c', kind: 'choose' }, { checkpointId: 'c', choice: ['explore'] }).ok).toBe(true);
    expect(checkResolution({ id: 'p', kind: 'pick', options }, { checkpointId: 'p', choice: ['A', 'B', 'C'] }).ok).toBe(true);
  });

  it('explains what is wrong', () => {
    const problem = (cp: Target, res: object): string => {
      const r = checkResolution(cp, { checkpointId: cp.id, ...res });
      return r.ok ? '' : r.problem;
    };
    expect(problem({ id: 'p', kind: 'pick', options, k: 1 }, { choice: ['A', 'B'] })).toBe('checkpoint "p" (pick): `choice` picks 2 options; at most 1 may be picked');
    expect(problem({ id: 'p', kind: 'pick', options }, { choice: ['Q'] })).toContain('unknown options "Q"');
    expect(problem({ id: 'p', kind: 'pick', options }, { choice: ['A', 'A'] })).toContain('twice');
    expect(problem({ id: 'p', kind: 'pick', options }, { choice: [1] })).toContain('non-empty list');
    expect(problem({ id: 'c', kind: 'choose', options }, { choice: ['A', 'B'] })).toContain('exactly one');
    expect(problem({ id: 'y', kind: 'confirm' }, { approved: 'yes' })).toContain('`approved`');
    expect(problem({ id: 'w', kind: 'write' }, {})).toContain('`text`');
  });

  it('refuses a resolution addressed to another checkpoint', () => {
    expect(checkResolution({ id: 'a', kind: 'confirm' }, { checkpointId: 'b', approved: true })).toEqual({ ok: false, problem: 'checkpoint "a" (confirm): the resolution names checkpoint "b"' });
  });
});
