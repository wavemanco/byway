import { describe, expect, it } from 'vitest';
import {
  BLOCKS,
  BLOCK_CODES,
  EXCEPTIONS,
  GLUE_CODES,
  PORT_TYPES,
  RULES,
  ROLE_KNOBS,
  TELLS_DOMAINS,
  type RuleId,
} from '../src/index.ts';

describe('ports', () => {
  it('has the sixteen ports of 02-grammar §3', () => {
    expect(PORT_TYPES).toEqual([
      'intent', 'seed', 'option_set<artifact>', 'taste', 'brief', 'artifact', 'view', 'refs',
      'critique', 'score', 'asset', 'anchor', 'tells', 'voice', 'cred', 'failed',
    ]);
  });
});

describe('blocks and glue', () => {
  it('has the eight blocks and six glue connectors', () => {
    expect(BLOCK_CODES).toEqual(['SEED', 'VISION', 'CRITIC', 'ASSET', 'RELAY', 'CUT', 'TELLS', 'VOICE']);
    expect(GLUE_CODES).toEqual(['RENDER', 'BRIEF', 'TIER', 'KEYS', 'BANK', 'dedupe']);
  });

  it('gives every block a stage, knobs and a bypass that suspends only default rules', () => {
    for (const code of BLOCK_CODES) {
      const def = BLOCKS[code];
      expect(['D1', 'D2', 'D3']).toContain(def.stage);
      expect(def.bypass.transform.length).toBeGreaterThan(0);
      for (const id of def.bypass.suspends) expect(RULES[id].class).toBe('default');
    }
  });

  it('registers enum and numeric knob ranges', () => {
    expect(BLOCKS.CRITIC.knobs.mode).toEqual({ type: 'enum', values: ['OK', 'GREAT', 'check'] });
    expect(BLOCKS.ASSET.knobs.slots).toEqual({ type: 'int', min: 1, max: 3 });
    expect(ROLE_KNOBS.build.avoid).toEqual({ type: 'string[]' });
  });

  it('registers the knobs C2–C7 need: critic family and fixed shuffles, TELLS catalog domains', () => {
    expect(BLOCKS.CRITIC.knobs.family).toEqual({ type: 'enum', values: ['same', 'other'] });
    expect(BLOCKS.CRITIC.knobs.shuffles).toEqual({ type: 'int', min: 1, max: 4 });
    const domains = BLOCKS.TELLS.knobs.domains;
    expect(domains?.type).toBe('enum[]');
    expect(domains && 'values' in domains ? domains.values : []).toEqual(TELLS_DOMAINS);
    expect(TELLS_DOMAINS).toEqual(expect.arrayContaining(['ui', 'prose-words', 'prose-structure', 'memo', 'code', 'fiction', 'application', 'media-style']));
  });
});

describe('rules', () => {
  const expected: Record<RuleId, string> = {
    ST1: 'invariant', ST2: 'invariant', ST3: 'invariant', ST4: 'invariant', ST5: 'invariant',
    ST6: 'invariant', ST7: 'invariant', ST8: 'invariant', ST9: 'invariant', ST10: 'invariant', ST11: 'invariant', ST12: 'invariant',
    PR1: 'hard', PR2: 'hard', PR3: 'invariant', PR4: 'hard', PR5: 'hard', PR6: 'hard',
    'PR7.1': 'hard', 'PR7.2': 'hard', PR8: 'invariant', CH3: 'hard', LS1: 'hard',
    DR1: 'default', DR2: 'default', DR3: 'default', DR4: 'default', DR5: 'default',
    DR6: 'default', DR7: 'default', DR8: 'default', DR9: 'default', DR10: 'advisory',
  };

  it('has exactly the spec rule set with the stated classes', () => {
    expect(Object.fromEntries(Object.entries(RULES).map(([id, r]) => [id, r.class]))).toEqual(expected);
  });

  it('gives every rule a title and a source', () => {
    for (const rule of Object.values(RULES)) {
      expect(rule.title.length).toBeGreaterThan(0);
      expect(rule.source.length).toBeGreaterThan(0);
    }
  });
});

describe('exceptions', () => {
  it('never relaxes an invariant or advisory rule', () => {
    for (const ex of Object.values(EXCEPTIONS)) {
      for (const id of ex.relaxes) expect(RULES[id].class === 'hard' || RULES[id].class === 'default').toBe(true);
    }
  });

  it('allows study manipulations only on the research-frozen channel', () => {
    for (const [id, ex] of Object.entries(EXCEPTIONS)) {
      if (ex.scope === 'study-manipulation') {
        expect(id).toMatch(/^SM-\d$/);
        expect(ex.channels).toEqual(['research-frozen']);
      }
    }
  });

  it('maps each exception to the rules in the spec', () => {
    expect(Object.fromEntries(Object.entries(EXCEPTIONS).map(([id, e]) => [id, e.relaxes]))).toEqual({
      'C1-DR2': ['DR2'],
      'C1-DR7': ['DR7'],
      'SM-1': ['PR4'],
      'SM-2': ['LS1'],
      'SM-3': ['CH3'],
      'SM-4': ['PR7.2'],
      'SM-5': ['PR1', 'PR2', 'DR3', 'DR4', 'DR5'],
      'SM-6': ['PR6', 'DR9'],
      'C2-DR4': ['DR4'],
      'C2-DR7': ['DR7'],
      'C4-DR9': ['DR9'],
      'C5-DR7': ['DR7'],
      'C6-DR4': ['DR4'],
      'C6-DR7': ['DR7'],
      'C6a-DR4': ['DR4'],
      'C6a-DR7': ['DR7'],
      'C7-PR1': ['PR1'],
      'C7-DR7': ['DR7'],
    });
  });

  it('declares the 03 ordering-principle exceptions clause-scoped and limited to their own family', () => {
    const declared = Object.values(EXCEPTIONS).filter((ex) => ex.scope === 'protocol-declared' && ex.id !== 'C1-DR2');
    for (const ex of declared) {
      const family = ex.id.slice(0, ex.id.lastIndexOf('-'));
      expect(ex.families, ex.id).toEqual([family]);
      for (const rule of ex.relaxes) expect(ex.clauses?.[rule]?.length, `${ex.id} ${rule}`).toBeGreaterThan(0);
      expect(ex.source, ex.id).toMatch(/^03 /);
    }
    expect(Object.fromEntries(declared.map((ex) => [ex.id, ex.clauses]))).toEqual({
      'C1-DR7': { DR7: ['check-after'] },
      'C2-DR4': { DR4: ['annotation'] },
      'C2-DR7': { DR7: ['voice-stage'] },
      'C4-DR9': { DR9: ['key-lines'] },
      'C5-DR7': { DR7: ['voice-stage', 'gate-after'] },
      'C6-DR4': { DR4: ['human-stop'] },
      'C6-DR7': { DR7: ['audit'] },
      'C6a-DR4': { DR4: ['human-stop'] },
      'C6a-DR7': { DR7: ['audit'] },
      'C7-PR1': { PR1: ['code-view'] },
      'C7-DR7': { DR7: ['cut-stage'] },
    });
  });

  it('limits Study 1 manipulations to the Study 1 families and scopes their clauses', () => {
    for (const [id, ex] of Object.entries(EXCEPTIONS)) {
      if (ex.scope === 'study-manipulation') expect(ex.families, id).toEqual(['C1', 'baseline']);
    }
    expect(EXCEPTIONS['C1-DR7']?.clauses).toEqual({ DR7: ['check-after'] });
    expect(EXCEPTIONS['SM-6']?.clauses).toEqual({ PR6: ['fixed-input'], DR9: ['fixed-input'] });
  });

  it('restricts SM-5 to the critique-self derivation', () => {
    expect(EXCEPTIONS['SM-5']?.requiresDerivation).toBe('critique-self');
  });
});
