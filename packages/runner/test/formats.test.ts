import { describe, expect, it } from 'vitest';
import { OUTPUT_CONTRACTS } from '@byway/prompts/pure';
import { applyCopy, extractCopy, lostVoiceLines, pageCopy, pageVoiceProblems, placePageCopy, skeleton } from '../src/copy.ts';
import { joinCodeDiff, parseArtifact, parseCodeDiff, splitCodeDiff, textView } from '../src/formats.ts';
import { parseBriefs, parseCheck, parseChoice, parseCritic, parseCut, parseDedupe, parseKeep, parseOverlap, parseRelay, parseTellsSweep, sectionOf } from '../src/parse.ts';

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Northloaf</title><style>h1{color:red}</style></head>
<body><main><h1>Bread before <em>seven</em></h1><p>Order by 9pm &amp; it's at your door.</p><a class="cta" href="#o">Get started</a>
<script>console.log("<p>not copy</p>")</script></main></body></html>`;

describe('artifact parsers (spec §3.3)', () => {
  it('takes the last fenced html block and refuses a fragment', () => {
    const r = parseArtifact('web-page', `Here.\n\n\`\`\`html\n<p>old</p>\n\`\`\`\n\n\`\`\`html\n${PAGE}\n\`\`\``);
    expect(r).toMatchObject({ ok: true });
    expect(parseArtifact('web-page', '```html\n<p>hi</p>\n```')).toMatchObject({ ok: false });
  });

  it('reads Markdown from a fenced block or the whole answer', () => {
    expect(parseArtifact('prose', '```markdown\n# T\n\nBody\n```')).toEqual({ ok: true, value: '# T\n\nBody\n' });
    expect(parseArtifact('prose', '# T\n\nBody')).toEqual({ ok: true, value: '# T\n\nBody\n' });
  });

  it('validates options and storyboards and stores them as JSON', () => {
    const ok = parseArtifact('options', '```json\n{"options":[{"title":"A","pitch":"B","rationale":"C"}]}\n```');
    expect(ok.ok && JSON.parse(ok.value)).toEqual({ options: [{ title: 'A', pitch: 'B', rationale: 'C' }] });
    expect(parseArtifact('options', '```json\n{"options":[]}\n```')).toMatchObject({ ok: false });
    expect(parseArtifact('media', '```json\n{"storyboard":[{"shot":1,"description":"d","imagePrompt":"p","durationSec":4}],"voiceover":"v"}\n```')).toMatchObject({ ok: true });
  });

  it('reads a diff and its Why paragraph, even when the paragraph slipped inside the block', () => {
    const diff = '--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,1 @@\n-a\n+b';
    expect(parseCodeDiff(`\`\`\`diff\n${diff}\n\`\`\`\n\nWhy: shorter.`)).toEqual({ ok: true, value: { diff, why: 'Why: shorter.' } });
    expect(parseCodeDiff(`\`\`\`diff\n${diff}\n\nWhy: inside.\n\`\`\``)).toEqual({ ok: true, value: { diff, why: 'Why: inside.' } });
    expect(parseCodeDiff(`\`\`\`diff\n${diff}\n\`\`\``)).toMatchObject({ ok: false });
    expect(splitCodeDiff(joinCodeDiff({ diff, why: 'Why: x' }))).toEqual({ diff, why: 'Why: x' });
  });

  it('renders text views by medium', () => {
    expect(textView('options', '{"options":[{"title":"Wedge","pitch":"Small","rationale":"Testable"}]}')).toBe('1. Wedge: Small\n   Why: Testable');
    expect(textView('media', '{"storyboard":[{"shot":1,"description":"Open","imagePrompt":"Hands","durationSec":4}],"voiceover":"Go."}')).toContain('Shot 1 (4s): Open');
  });
});

describe('judging parsers (spec §3.3)', () => {
  it('reads a critic by the mode it was asked in: OK scores, GREAT ranks the whole lineup (ADR-0072)', () => {
    const lineup = ['A', 'B', 'C', 'D', 'E'];
    expect(parseCritic('- gap\nScore: 7/10')).toEqual({ ok: true, value: { mode: 'OK', critique: '- gap', score: 7 } });
    expect(parseCritic('- gap\nScore: 11/10')).toMatchObject({ ok: false });
    expect(parseCritic('### A\n- gap\n\nRanking: C, A, E, B, D', lineup)).toEqual({ ok: true, value: { mode: 'GREAT', critique: '### A\n- gap', ranking: ['C', 'A', 'E', 'B', 'D'] } });
    // Emphasis, a full stop and loose spacing are a model's habits, not a different answer.
    expect(parseCritic('- gap\n**Ranking: c,A ,E, B, D.**', lineup)).toMatchObject({ ok: true, value: { ranking: ['C', 'A', 'E', 'B', 'D'] } });
    // Each mode refuses the other's answer.
    expect(parseCritic('- gap\nRanking: C, A, E, B, D')).toMatchObject({ ok: false });
    expect(parseCritic('- gap\nScore: 7/10', lineup)).toMatchObject({ ok: false });
    // Every label exactly once: none missing, none twice, none unknown.
    for (const bad of ['Ranking: C, A, E, B', 'Ranking: C, A, E, B, D, A', 'Ranking: C, A, E, B, F', 'Ranking: C, A, E, B, B', 'Rank: 2 of 5']) {
      const r = parseCritic(`- gap\n${bad}`, lineup);
      expect(r, bad).toMatchObject({ ok: false });
      if (!r.ok) expect(r.problem).toMatch(/Ranking: /);
    }
  });

  it('finds one item’s section of a lineup critique, heading stripped', () => {
    const critique = '### A\n- Intent: calm.\n- Too long.\n\n### B — the bakery\n- Intent: warm.\n- The ask is buried.\n\n### C\n- Intent: plain.';
    expect(sectionOf(critique, 'B')).toBe('- Intent: warm.\n- The ask is buried.');
    expect(sectionOf(critique, 'C')).toBe('- Intent: plain.');
    expect(sectionOf('## A\n- Fine.\n## AB\n- Other.', 'A')).toBe('- Fine.');
    expect(sectionOf(critique, 'D')).toBeUndefined();
    expect(sectionOf('### B\n', 'B')).toBeUndefined();
  });

  it('stops the last item’s section at the closing ranking line', () => {
    const answer = '### A\n- Intent: calm.\n\n### B\n- Intent: warm.\n- The ask is buried.\n\nRanking: A, B';
    expect(sectionOf(answer, 'B')).toBe('- Intent: warm.\n- The ask is buried.');
    expect(sectionOf('### B\n- Intent: warm.\n**Ranking: B, A**', 'B')).toBe('- Intent: warm.');
  });

  it('reads choices, checks, cuts, keeps', () => {
    expect(parseChoice('B is best.\nChoice: B', ['A', 'B'])).toEqual({ ok: true, value: 'B' });
    expect(parseChoice('Choice: C', ['A', 'B'])).toMatchObject({ ok: false });
    expect(parseCheck('No defects.')).toEqual({ ok: true, value: { clean: true, defects: 'No defects.' } });
    expect(parseCheck('- Text overflows.')).toMatchObject({ ok: true, value: { clean: false } });
    expect(parseCut('- Remove the banner.\n- Make it pop.')).toEqual({ ok: true, value: '- Remove the banner.' });
    expect(parseCut('- Make it pop.')).toMatchObject({ ok: false });
    // "Nothing to remove." is an empty directive, not a miss.
    expect(parseCut('Nothing to remove.')).toEqual({ ok: true, value: '' });
    expect(parseCut('**Nothing to remove**\n')).toEqual({ ok: true, value: '' });
    expect(parseCut('')).toMatchObject({ ok: false });
    expect(parseKeep('Better.\nKeep: B')).toEqual({ ok: true, value: 'B' });
  });

  it('reads sweeps, dedupes, overlaps, briefs and relay links', () => {
    expect(parseTellsSweep('```json\n{"hits":[{"pattern":"delve","where":"Body","alternative":"look at"}]}\n```')).toMatchObject({ ok: true, value: { critique: '- delve (Body): look at' } });
    expect(parseDedupe('```json\n{"keep":["A","B"],"merged":[{"into":"A","from":["C"]}]}\n```', ['A', 'B', 'C'])).toEqual({ ok: true, value: { keep: ['A', 'B'] } });
    expect(parseDedupe('```json\n{"keep":["A"],"merged":[]}\n```', ['A', 'B'])).toMatchObject({ ok: false });
    expect(parseOverlap('```json\n{"flags":[{"label":"B","overlapsWith":"V2","note":"Same hook."}]}\n```', ['A', 'B'], ['V1', 'V2'])).toEqual({ ok: true, value: '- Option B overlaps the plain answer V2: Same hook.' });
    expect(parseBriefs('```json\n{"images":[{"slot":1,"prompt":"p","alt":"a","size":"1536x1024"}]}\n```')).toMatchObject({ ok: true, value: [{ slot: '1' }] });
    expect(parseRelay('```json\n{"clipPrompt":"Shot 1: go","durationSec":4}\n```')).toEqual({ ok: true, value: { clipPrompt: 'Shot 1: go', durationSec: 4 } });
  });
});

describe('VOICE copy', () => {
  it('extracts a page’s visible copy by block, skipping scripts and styles', () => {
    expect(pageCopy(PAGE)).toEqual(['Northloaf', 'Bread before seven', "Order by 9pm & it's at your door.", 'Get started']);
  });

  it('places edited lines without touching a tag, and the diff check accepts it', () => {
    const edited = ['Northloaf', 'Warm bread by six', 'Order tonight & wake up to it.', 'Order now'];
    const placed = placePageCopy(PAGE, edited);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(pageCopy(placed.value)).toEqual(edited);
    expect(skeleton(placed.value)).toBe(skeleton(PAGE));
    expect(pageVoiceProblems(PAGE, placed.value, edited)).toEqual([]);
    expect(placed.value).toContain('Order tonight &amp; wake up to it.');
  });

  it('refuses a write-back that changed markup or lost a line', () => {
    const changed = PAGE.replace('class="cta"', 'class="cta big"');
    expect(pageVoiceProblems(PAGE, changed, pageCopy(PAGE))[0]).toMatch(/beyond its text/);
    expect(pageVoiceProblems(PAGE, PAGE, ['A line nobody placed'])[0]).toMatch(/exactly as written/);
    expect(placePageCopy(PAGE, ['too few'])).toMatchObject({ ok: false });
  });

  it('writes structured copy back field by field', () => {
    const options = '{"options":[{"title":"Wedge","pitch":"Small","rationale":"Testable"}]}';
    const copy = extractCopy('options', options);
    expect(copy).toBe('### A\nTitle: Wedge\nPitch: Small\nRationale: Testable');
    const back = applyCopy('options', options, copy.replace('Small', 'Tiny and sharp'));
    expect(back.ok && JSON.parse(back.value).options[0].pitch).toBe('Tiny and sharp');
    const sb = '{"storyboard":[{"shot":1,"description":"d","imagePrompt":"p","durationSec":4,"imageArtifactId":"sha256:x"}],"voiceover":"Old."}';
    const media = applyCopy('media', sb, 'New words.');
    expect(media.ok && JSON.parse(media.value)).toMatchObject({ voiceover: 'New words.', storyboard: [{ imageArtifactId: 'sha256:x' }] });
    const diff = joinCodeDiff({ diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b', why: 'Why: old.' });
    expect(extractCopy('code-diff', diff)).toBe('Why: old.');
    const why = applyCopy('code-diff', diff, 'Because the old one leaked.');
    expect(why.ok && splitCodeDiff(why.value).why).toBe('Why: Because the old one leaked.');
  });

  it('finds the person’s lines a machine write lost', () => {
    const sb = (vo: string) => JSON.stringify({ storyboard: [{ shot: 1, description: 'd', imagePrompt: 'p', durationSec: 4 }], voiceover: vo });
    expect(lostVoiceLines('media', sb('Less time. More life.'), 'Less time. More life.')).toEqual([]);
    expect(lostVoiceLines('media', sb('Something else.'), 'Less time. More life.')).toEqual(['Less time. More life.']);
    // Measured against where the write started: words that were never placed are not required.
    expect(lostVoiceLines('media', sb('Something else.'), 'Less time. More life.', sb('Earlier draft.'))).toEqual([]);
    expect(lostVoiceLines('media', sb('Something else.'), 'Less time. More life.', sb('Less time. More life.'))).toEqual(['Less time. More life.']);
  });
});

describe('the output contracts as @byway/prompts states them (spec §3.3)', () => {
  /** The quoted final lines of a contract, e.g. "Score: N/10" and "Ranking: C, A, E, B, D". */
  const quoted = (id: keyof typeof OUTPUT_CONTRACTS): string[] => [...OUTPUT_CONTRACTS[id].matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

  it('the runner reads the very lines the contracts quote, so a template and its parser cannot drift apart', () => {
    const critique = quoted('critique');
    const score = critique.find((q) => q.startsWith('Score:'))!.replace('N', '7');
    expect(parseCritic(`- gap\n${score}`)).toMatchObject({ ok: true, value: { mode: 'OK', score: 7 } });
    const ranking = critique.find((q) => q.startsWith('Ranking:'))!;
    const lineup = [...ranking.matchAll(/[A-Z](?=,|$)/g)].map((m) => m[0]).sort();
    expect(parseCritic(`### A\n- gap\n\n${ranking}`, lineup)).toMatchObject({ ok: true, value: { mode: 'GREAT' } });
    expect(parseCut(quoted('cut').find((q) => q.startsWith('Nothing'))!)).toEqual({ ok: true, value: '' });
    expect(parseCheck(quoted('defects').find((q) => q.startsWith('No defects'))!)).toMatchObject({ ok: true, value: { clean: true } });
    for (const keep of quoted('keep')) expect(parseKeep(`Reasons.\n${keep}`)).toMatchObject({ ok: true });
    expect(parseChoice(`Reasons.\n${quoted('choice')[0]!.replace('<label>', 'B')}`, ['A', 'B'])).toEqual({ ok: true, value: 'B' });
  });
});
