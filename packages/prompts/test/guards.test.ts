import { describe, expect, it } from 'vitest';
import type { OutputId } from '../src/index.ts';
import { FILES, PROMPT_STEPS, ROLES_BY_PROMPT } from './library.ts';

/**
 * Static guards for the protocol's hard port rules (02 §3) and the product's claims rule (spec §4), read from the
 * template files themselves.
 */

const outputOf = (f: (typeof FILES)[number]): OutputId => f.template.output;
const uses = (f: (typeof FILES)[number], slot: string) => f.template.slots.includes(slot as never);

/** Judging calls: they see views (and references), never the work's source or process (port rule 1). */
const JUDGING: OutputId[] = ['critique', 'choice', 'defects', 'tells-hits', 'keep', 'cut', 'overlap'];
/** The calls a hidden threshold must never reach (port rule 2): critics, judges, checks and re-ranks. */
const THRESHOLD_FREE: OutputId[] = ['critique', 'choice', 'defects'];

const SEED_IDS = new Set(PROMPT_STEPS.filter((p) => p.step.role === 'seed').map((p) => p.step.prompt as string));
const isCatalog = (f: (typeof FILES)[number]) => outputOf(f) === 'catalog';

/** Catalog patterns: the left side of every "- pattern → alternative" line of every tells.* template. */
const PATTERNS = FILES.filter(isCatalog).flatMap((f) =>
  f.raw
    .split('\n')
    .filter((l) => /^- .+ → /.test(l))
    .map((l) => l.slice(2, l.indexOf(' → ')).replace(/\*\*/g, '').trim()),
);
/** Quoted examples inside the patterns ("testament", "delve"…): the most recognizable part of a catalog. */
const QUOTED = [...new Set(PATTERNS.flatMap((p) => [...p.matchAll(/"([^"]{3,})"/g)].map((m) => (m[1] as string).toLowerCase())))];

describe('port rules and claims, checked on the template files', () => {
  it('reads catalog patterns from the tells templates (so the checks below are not vacuous)', () => {
    expect(PATTERNS.length).toBeGreaterThan(60);
    expect(QUOTED.length).toBeGreaterThan(10);
  });

  it.each(FILES.filter((f) => THRESHOLD_FREE.includes(outputOf(f))).map((f) => [f.name, f] as const))(
    'rule 2: %s holds no threshold or score target',
    (_n, f) => {
      const text = f.raw;
      expect(text).not.toMatch(/\b\d+(\.\d+)?\s*\/\s*10\b/); // "9/10" and the like; the answer format "Score: N/10" is allowed
      expect(text).not.toMatch(/threshold|until you (score|reach|rank)|pass mark|passing score|stop when|you are done when/i);
      expect(text).not.toMatch(/\btop \d+ of\b|\bat or above\b|\bmedian\b|\branks? (first|1st)\b/i);
    },
  );

  it.each(FILES.filter((f) => JUDGING.includes(outputOf(f))).map((f) => [f.name, f] as const))('rule 1: %s never sees the artifact\'s source', (_n, f) => {
    expect(uses(f, 'artifact')).toBe(false);
  });

  it.each(FILES.filter((f) => outputOf(f) === 'critique').map((f) => [f.name, f] as const))(
    'rules 1 and 5: critic %s sees only the view and the references (no brief, critique, options or round)',
    (_n, f) => {
      expect(f.template.slots.filter((s) => !['view', 'refs', 'labels', 'medium'].includes(s))).toEqual([]);
    },
  );

  it('rule 7: only TELLS sweep templates take the tell catalog', () => {
    const takers = FILES.filter((f) => uses(f, 'tells'));
    expect(takers.length).toBeGreaterThan(5);
    for (const f of takers) expect(outputOf(f), f.name).toBe('tells-hits');
    for (const f of FILES.filter((x) => outputOf(x) === 'tells-hits')) expect(uses(f, 'tells'), f.name).toBe(true);
  });

  it.each(FILES.filter((f) => !isCatalog(f)).map((f) => [f.name, f] as const))('rule 7: %s holds no catalog text', (_n, f) => {
    const text = f.raw.toLowerCase();
    expect(PATTERNS.filter((p) => p.length > 12 && text.includes(p.toLowerCase()))).toEqual([]);
    expect(QUOTED.filter((q) => text.includes(q))).toEqual([]);
  });

  it('rule 3: only SEED templates take the seed, and each says never to reveal it', () => {
    const takers = FILES.filter((f) => uses(f, 'seed')).map((f) => f.template.id);
    expect(new Set(takers)).toEqual(SEED_IDS);
    for (const f of FILES.filter((x) => SEED_IDS.has(x.template.id))) {
      expect(f.raw, f.name).toMatch(/never (quote|show|reveal|repeat)/i);
      // The string sits in the prompt only once: nowhere it could be echoed as an example.
      expect(f.raw.split('{{seed}}').length - 1, f.name).toBe(1);
    }
  });

  it.each(FILES.map((f) => [f.name, f] as const))('rule 8 and claims: %s mentions no AI detectors, evasion or efficacy claims', (_n, f) => {
    expect(f.raw).not.toMatch(/detector|detection|evade|evasion|undetectable|humaniz|pass as human|sound human/i);
    expect(f.raw).not.toMatch(/research-backed|\bproven\b|studies show|outperforms|evidence-based|scientifically|guaranteed/i);
  });

  it('roles in the catalog line up with the guard groups (a sanity check on the tables above)', () => {
    for (const [id, roles] of ROLES_BY_PROMPT) {
      const f = FILES.find((x) => x.template.id === id);
      if (!f) continue;
      if (roles.has('critic')) expect(outputOf(f)).toBe('critique');
      if (roles.has('check')) expect(outputOf(f)).toBe('defects');
      if (roles.has('tells-sweep')) expect(outputOf(f)).toBe('tells-hits');
    }
  });
});
