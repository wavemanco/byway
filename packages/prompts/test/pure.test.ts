import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as pure from '../src/pure.ts';

/** `@byway/prompts/pure` is for Temporal workflow bundles, where Node built-ins are not allowed. */
describe('the pure entry', () => {
  it('exports ids, output contracts and slot helpers', () => {
    for (const name of ['PROMPT_IDS', 'HELPER_PROMPTS', 'tellsPromptIds', 'OUTPUT_CONTRACTS', 'outputForPurpose', 'outputForStep', 'labelled', 'greatLineup', 'imagesSlot', 'problemSlot']) {
      expect(pure, name).toHaveProperty(name);
    }
  });

  it('imports no Node built-ins and nothing that does', () => {
    for (const file of ['pure.ts', 'ids.ts', 'outputs.ts', 'slots.ts']) {
      const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      expect(text, file).not.toMatch(/from 'node:|require\(/);
      for (const m of text.matchAll(/from '\.\/([a-z-]+)\.ts'/g)) expect(['ids', 'outputs', 'slots'], `${file} imports ${m[1]}`).toContain(m[1]);
    }
  });
});
