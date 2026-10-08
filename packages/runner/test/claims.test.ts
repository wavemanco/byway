/**
 * The claim log (03 C4; 01 VOICE step 6): the owner signs off every number, date, name and causal claim, and their
 * corrections replace the claims in the document (ENG-2). The lines offered are the claims as sentences, each once,
 * with no doubled list markers and no internal marker lines (UX-5, UX-6).
 */
import { describe, expect, it } from 'vitest';
import { applyClaims, claimLines, claimsOf } from '../src/claims.ts';

const MEMO = [
  '# Billing migration',
  '',
  '**Ask:** Approve the two-week pilot by Friday.',
  '',
  'The current approach works, but it costs us about a day a week in rework. The team is small.',
  '',
  '## Risks',
  '',
  '- Two people carry most of the context, which slows reviews.',
  '- The vendor contract renews in six weeks, so the clock is real.',
  '- Decide on the 30th, with the numbers in hand.',
  '1. Revenue grew 12% last quarter because Acme signed.',
  '> The outage lasted 47 minutes on March 3 and cost $12,000.',
  '',
  '```bash',
  'deploy --region 3',
  '```',
  '',
  '[docs]: https://example.com/runbook-2',
  '<!-- reviewed 2 times -->',
  '',
  '[//]: # (byway-demo-revision: 2)',
  '',
].join('\n');

describe('the claims offered for sign-off (UX-5)', () => {
  it('lists every sentence with a number, a date, a name or a causal claim, each once and without its list marker', () => {
    expect(claimLines(MEMO).split('\n')).toEqual([
      '- **Ask:** Approve the two-week pilot by Friday.',
      '- The current approach works, but it costs us about a day a week in rework.',
      '- Two people carry most of the context, which slows reviews.',
      '- The vendor contract renews in six weeks, so the clock is real.',
      '- Decide on the 30th, with the numbers in hand.',
      '- Revenue grew 12% last quarter because Acme signed.',
      '- The outage lasted 47 minutes on March 3 and cost $12,000.',
    ]);
  });

  it('leaves out headings, code, link definitions, comments and the demo marker', () => {
    const lines = claimLines(MEMO);
    expect(lines).not.toMatch(/byway-demo-revision|reviewed 2 times|runbook-2|deploy --region|^- #/m);
    expect(lines).not.toMatch(/^- - /m);
    expect(lines).not.toContain('The team is small.');
  });

  it('knows where each claim stands in the document', () => {
    for (const c of claimsOf(MEMO)) expect(MEMO.slice(c.start, c.end).replace(/\s+/g, ' ')).toBe(c.text);
  });
});

describe('corrections write back into the document (ENG-2)', () => {
  const offered = claimLines(MEMO);

  it('replaces a corrected claim where it stood, and nothing else', () => {
    const edited = offered.replace('47 minutes on March 3 and cost $12,000', '74 minutes on March 4 and cost $21,000').replace('Revenue grew 12%', 'Revenue grew 9%');
    const r = applyClaims(MEMO, edited);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe(MEMO.replace('47 minutes on March 3 and cost $12,000', '74 minutes on March 4 and cost $21,000').replace('Revenue grew 12%', 'Revenue grew 9%'));
    expect(r.value.changed).toHaveLength(2);
  });

  it('changes nothing when every claim is signed off as it was (bullets or not, spacing aside)', () => {
    const r = applyClaims(MEMO, `${offered.replace(/^- /gm, '')}\n\n`);
    expect(r).toEqual({ ok: true, value: { text: MEMO, changed: [] } });
  });

  it('takes a claim out when its line is emptied, and an emptied list item with it', () => {
    const edited = offered.replace('- Decide on the 30th, with the numbers in hand.', '-').replace('- The current approach works, but it costs us about a day a week in rework.', '-');
    const r = applyClaims(MEMO, edited);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).not.toContain('Decide on the 30th');
    expect(r.value.text).not.toMatch(/^- *$/m);
    expect(r.value.text).toContain('\nThe team is small.\n');
    expect(r.value.text).not.toContain('a day a week');
  });

  it('refuses an answer that adds or drops lines, saying how to fix it', () => {
    const r = applyClaims(MEMO, `${offered}\n- A claim of my own: 3 teams.`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/one line per claim/);
  });
});
