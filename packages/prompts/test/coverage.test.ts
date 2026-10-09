import { describe, expect, it } from 'vitest';
import { MEDIA, type PromptSlot } from '@byway/contracts';
import { TELLS_DOMAINS } from '@byway/protocol';
import {
  ADVISOR_PROMPT_IDS,
  HELPER_PROMPTS,
  outputForPurpose,
  outputForStep,
  PROMPT_IDS,
  RECIPE_PROMPT_IDS,
  TELLS_DOMAIN_IDS,
  TELLS_MEDIUM_IDS,
  tellsPromptIds,
} from '../src/index.ts';
import { inputsOf } from '@byway/recipe';
import { FILES, library, PROMPT_STEPS, slotsForPorts } from './library.ts';

describe('every prompt id has a template', () => {
  it('covers every prompt id the eight protocol configurations use, collected from @byway/catalog', () => {
    const used = [...new Set(PROMPT_STEPS.map((p) => p.step.prompt as string))].sort();
    expect(used.length).toBeGreaterThan(60);
    expect(used.filter((id) => !library.has(id))).toEqual([]);
    // …and the literal list of recipe prompt ids is exactly that set (no orphans, nothing missing).
    expect([...RECIPE_PROMPT_IDS].sort()).toEqual(used);
  });

  it('exports the list of ids, equal to the templates directory', () => {
    expect([...PROMPT_IDS].sort()).toEqual(library.ids());
    expect(new Set(PROMPT_IDS).size).toBe(PROMPT_IDS.length);
  });

  it.each(PROMPT_STEPS.map((p) => [`${p.recipe.id} ${p.step.id}`, p] as const))('%s: the template answers its step\'s role in the recipe\'s medium', (_name, p) => {
    const info = library.info(p.step.prompt as string, p.medium);
    expect(info.output).toBe(outputForStep(p.step, p.medium));
  });

  it.each(PROMPT_STEPS.map((p) => [`${p.recipe.id} ${p.step.id}`, p] as const))('%s: the template uses only slots its ports fill (spec §3.2)', (_name, p) => {
    const info = library.info(p.step.prompt as string, p.medium);
    const allowed = slotsForPorts(inputsOf(p.step));
    // Slots the conventions add beyond the ports: the runner's string for SEED, a GREAT lineup's labels, the relay
    // link's "Shot N" in the brief slot, the option labels an ASSET step on options draws one image for.
    if (p.step.role === 'seed') allowed.add('seed');
    // Every critic template branches on refs (ADR-0071), even where the recipe runs it in OK mode only (C1).
    if (p.step.role === 'critic') for (const s of ['refs', 'labels'] as const) allowed.add(s);
    if (p.step.role === 'relay') allowed.add('brief');
    if (p.step.role === 'asset' && p.medium === 'options') allowed.add('options');
    expect(info.slots.filter((s: PromptSlot) => !allowed.has(s))).toEqual([]);
  });

  it('has the runner helpers, with the variants their purposes need', () => {
    expect(library.variants(HELPER_PROMPTS['asset.briefs'])).toEqual(['media', 'options', 'prose', 'web-page']);
    expect(library.variants(HELPER_PROMPTS['asset.integrate'])).toEqual(['prose', 'web-page']);
    expect(library.variants(HELPER_PROMPTS['voice.apply'])).toEqual([...MEDIA].sort());
    expect(library.has(HELPER_PROMPTS.rerank)).toBe(true);
    for (const m of MEDIA) expect(() => library.info(HELPER_PROMPTS.rerank, m)).not.toThrow();
  });

  it.each(Object.entries(HELPER_PROMPTS))('helper %s answers its purpose in every medium it serves', (purpose, id) => {
    const media = library.variants(id).length ? library.variants(id) : MEDIA;
    for (const m of media) expect(library.info(id, m).output).toBe(outputForPurpose(`${purpose}:${m}`));
  });

  it.each(ADVISOR_PROMPT_IDS.map((id) => [id]))('advisor template %s answers its purpose', (id) => {
    expect(library.info(id).output).toBe(outputForPurpose(id));
  });

  it('has a tell catalog for every medium and for every 01 TELLS domain, as catalog text with no slots', () => {
    for (const id of [...TELLS_MEDIUM_IDS, ...TELLS_DOMAIN_IDS]) {
      const info = library.info(id);
      expect(info.output).toBe('catalog');
      expect(info.slots).toEqual([]);
    }
    for (const m of MEDIA) expect(tellsPromptIds(m).every((id) => library.has(id))).toBe(true);
    expect(tellsPromptIds('prose', ['memo', 'fiction'])).toEqual(['tells.memo', 'tells.fiction']);
    for (const d of TELLS_DOMAINS) expect(library.has(`tells.${d}`)).toBe(true);
  });

  it('marks the article\'s prompts as paraphrases (the article is copyrighted) and the project\'s own as project', () => {
    for (const f of FILES) {
      if (f.template.id.startsWith('article.')) expect(f.template.fidelity, f.name).toBe('paraphrase');
      if (f.template.id.startsWith('product.') || f.template.id.startsWith('helper.') || f.template.id.startsWith('advisor.')) expect(f.template.fidelity, f.name).toBe('project');
      expect(f.template.fidelity, f.name).not.toBe('verbatim');
    }
  });

  it('every SEED step\'s template takes the seed slot; the vo-audio step is skipped in v1 and says so in its contract', () => {
    for (const p of PROMPT_STEPS.filter((x) => x.step.role === 'seed')) expect(library.info(p.step.prompt as string).slots).toContain('seed');
    expect(library.info('product.c5.vo-audio').output).toBe('none');
  });
});
