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

  it('leaves out headings that are only labels, code, link definitions, comments and the demo marker', () => {
    const lines = claimLines(MEMO);
    expect(lines).not.toMatch(/byway-demo-revision|reviewed 2 times|runbook-2|deploy --region|^- #/m);
    expect(lines).not.toMatch(/^- - /m);
    expect(lines).not.toContain('The team is small.');
    expect(lines).not.toMatch(/Billing migration|Risks/);
  });

  it('knows where each claim stands in the document', () => {
    for (const c of claimsOf(MEMO)) expect(MEMO.slice(c.start, c.end).replace(/\s+/g, ' ')).toBe(c.text);
  });

  it('offers the claims in headings, the title among them, without their # marks (ENG-2)', () => {
    const doc = [
      '# RCA memo: the outage lasted 47 minutes on March 3 and cost $12,000',
      '',
      '## Impact: 47 minutes of downtime ##',
      '',
      '## Root cause',
      '',
      '## Next Steps',
      '',
      'Body text without facts.',
    ].join('\n');
    expect(claimLines(doc).split('\n')).toEqual(['- RCA memo: the outage lasted 47 minutes on March 3 and cost $12,000', '- Impact: 47 minutes of downtime']);
    for (const c of claimsOf(doc)) expect(doc.slice(c.start, c.end)).toBe(c.text);
  });

  it('offers a sentence wrapped across lines as one claim, in a paragraph, a list item or a quote (ENG-2)', () => {
    const doc = [
      'It cost $12,000 in credits because the failover',
      'took 20 minutes to trigger. The team is small.',
      '',
      '- Two people carry most of the context,',
      '  which slows reviews.',
      '- The vendor renews in six weeks.',
      '',
      '> The outage lasted 47 minutes',
      '> on March 3.',
      '',
      '| Metric | Value |',
      '|---|---|',
      '| Duration | 47 min |',
      '| Cost | $12,000 |',
    ].join('\n');
    expect(claimLines(doc).split('\n')).toEqual([
      '- It cost $12,000 in credits because the failover took 20 minutes to trigger.',
      '- Two people carry most of the context, which slows reviews.',
      '- The vendor renews in six weeks.',
      '- The outage lasted 47 minutes on March 3.',
      '- | Metric | Value |',
      '- | Duration | 47 min |',
      '- | Cost | $12,000 |',
    ]);
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

  it('a fact corrected in the claim log does not survive in the title or a heading (ENG-2, the re-check)', () => {
    const doc = [
      '# Outage of March 3: 47 minutes, $12,000',
      '',
      '## Impact: 47 minutes of downtime',
      '',
      'The outage lasted 47 minutes on March 3.',
      'It cost $12,000 in credits because the failover',
      'took 20 minutes to trigger.',
      '',
      '> The outage lasted 47 minutes',
      '> on March 3.',
      '',
      '**Owner:** Priya Shah',
      '',
      '*The outage lasted 47 minutes.* We restored at 10:15.',
    ].join('\n');
    const r = applyClaims(doc, claimLines(doc).replace(/47/g, '74'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).not.toContain('47');
    expect(r.value.text.split('\n').slice(0, 3)).toEqual(['# Outage of March 3: 74 minutes, $12,000', '', '## Impact: 74 minutes of downtime']);
    // The wrapped quote is rewritten on its first line, inside the quote.
    expect(r.value.text).toContain('\n> The outage lasted 74 minutes on March 3.\n');
    // A wrapped claim that was signed off as it was keeps its line break.
    expect(r.value.text).toContain('It cost $12,000 in credits because the failover\ntook 20 minutes to trigger.');
  });

  it('corrects and takes out a wrapped claim as a whole, and an emptied heading goes with its line', () => {
    const doc = ['# Q3 outage: 47 minutes', '', 'Intro.', '', '- Two people carry most of the context,', '  which slows reviews.', '- Last item, with Acme.', ''].join('\n');
    const offered = claimLines(doc).split('\n');
    expect(offered).toEqual(['- Q3 outage: 47 minutes', '- Two people carry most of the context, which slows reviews.', '- Last item, with Acme.']);
    const corrected = applyClaims(doc, ['- Q3 outage: 74 minutes', '- Three people carry most of the context, which slows reviews.', offered[2]!].join('\n'));
    expect(corrected.ok && corrected.value.text).toBe(['# Q3 outage: 74 minutes', '', 'Intro.', '', '- Three people carry most of the context, which slows reviews.', '- Last item, with Acme.', ''].join('\n'));
    const removed = applyClaims(doc, ['-', '-', offered[2]!].join('\n'));
    expect(removed.ok && removed.value.text).toBe(['', 'Intro.', '', '- Last item, with Acme.', ''].join('\n'));
  });

  it('refuses an answer that adds or drops lines, saying how to fix it', () => {
    const r = applyClaims(MEMO, `${offered}\n- A claim of my own: 3 teams.`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/one line per claim/);
  });
});
