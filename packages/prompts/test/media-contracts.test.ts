/**
 * Templates held to what their steps execute (ADR-0090): C7's implement works from the spec when there is one and
 * names its requirements in the "Why:" the blind scope cut reads.
 */
import { describe, expect, it } from 'vitest';
import { library } from './library.ts';

describe('C7 implement (F09)', () => {
  const render = (brief: string) => library.render('product.c7.implement', { medium: 'code-diff', problem: 'Make the export handle currencies.', brief });

  it('with a spec: shows it, and asks the “Why:” to name the requirements that shaped the change', () => {
    const p = render('1. Keep the CSV header? Default: yes.');
    expect(p.version).toBe(3);
    expect(p.user).toContain('<brief>\n1. Keep the CSV header? Default: yes.\n</brief>');
    expect(p.user).toMatch(/Name in it the requirements from the spec that shaped the change/);
  });

  it('without one: neither the spec section nor the instruction about it', () => {
    const p = render('');
    expect(p.user).not.toContain('<brief>');
    expect(p.user).not.toMatch(/requirements from the spec/);
  });
});
