import { describe, expect, it } from 'vitest';
import { OUTPUT_CONTRACTS } from '@byway/prompts/pure';
import { applyCopy, extractCopy, layoutOf, lockCopy, pageCopy, pageEditProblems, placePageEdit, readPageCopy, readPageEdit, roundTripProblem, sameCopy } from '../src/copy.ts';
import { joinCodeDiff, parseArtifact, parseCodeDiff, serializeJson, splitCodeDiff, textView } from '../src/formats.ts';
import { ADVICE_MAX, parseBriefs, parseCheck, parseChoice, parseCritic, parseCut, parseDedupe, parseKeep, parseOverlap, parseRelay, parseTellsSweep, sectionOf } from '../src/parse.ts';

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
    expect(parseBriefs('```json\n{"images":[{"slot":1,"prompt":"p","alt":"a","size":"1536x1024"}]}\n```')).toMatchObject({ ok: true, value: { images: [{ slot: '1' }] } });
    expect(parseRelay('```json\n{"clipPrompt":"Shot 1: go","durationSec":4}\n```')).toEqual({ ok: true, value: { clipPrompt: 'Shot 1: go', durationSec: 4 } });
  });

  describe('a brief answer’s optional line of advice (D3, ADR-0101)', () => {
    const answer = (...advice: unknown[]) =>
      '```json\n' + JSON.stringify({ images: [{ slot: 'header', prompt: 'p', alt: 'a', size: '1536x1024' }], ...(advice.length ? { advice: advice[0] } : {}) }) + '\n```';
    const briefsOnly = { ok: true, value: { images: [{ slot: 'header', prompt: 'p', alt: 'a', size: '1536x1024' }] } };

    it('is read as one plain line', () => {
      expect(parseBriefs(answer())).toEqual(briefsOnly);
      expect(parseBriefs(answer('  This piece may read\nbetter   without a header.  '))).toEqual({ ok: true, value: { ...briefsOnly.value, advice: 'This piece may read better without a header.' } });
    });

    it('empty, or anything but text, is no advice, and never a miss: advice never costs a retry', () => {
      for (const none of ['', ' \n\t ', 42, null, true, ['a'], { a: 1 }]) expect(parseBriefs(answer(none)), JSON.stringify(none)).toEqual(briefsOnly);
    });

    it('is plain text: control and direction-changing characters go, and a lone surrogate becomes U+FFFD', () => {
      expect(parseBriefs(answer('Cut\u0007 it\u202E at\u2066 Trim\u200B\ud800.'))).toMatchObject({ value: { advice: 'Cut it at Trim\uFFFD.' } });
      // Joiners stay: they hold emoji and some scripts together.
      expect(parseBriefs(answer('Keep 👩\u200D🍳 out.'))).toMatchObject({ value: { advice: 'Keep 👩\u200D🍳 out.' } });
      // Only control characters is no advice.
      expect(parseBriefs(answer('\u0007\u202E'))).toEqual(briefsOnly);
    });

    it(`is held to ${ADVICE_MAX} characters: a longer line is cut at a word, with an ellipsis`, () => {
      const r = parseBriefs(answer(`${'word '.repeat(80)}end`));
      const advice = r.ok ? r.value.advice! : '';
      expect([...advice].length).toBeLessThanOrEqual(ADVICE_MAX);
      expect(advice).toMatch(/^word( word)+…$/);
      const exact = 'a'.repeat(ADVICE_MAX);
      expect(parseBriefs(answer(exact))).toMatchObject({ value: { advice: exact } });
      // Counted in characters, so a cut never splits one.
      const r2 = parseBriefs(answer('😀'.repeat(ADVICE_MAX + 5)));
      expect(r2.ok && r2.value.advice!.isWellFormed()).toBe(true);
      expect(r2.ok && [...r2.value.advice!].length).toBe(ADVICE_MAX);
    });
  });
});

describe('VOICE copy', () => {
  it('extracts a page’s visible copy by block, skipping scripts and styles', () => {
    expect(pageCopy(PAGE)).toEqual(['Northloaf', 'Bread before seven', "Order by 9pm & it's at your door.", 'Get started']);
  });

  it('places edited lines without touching a tag, and the verifier accepts it', () => {
    const edited = ['Northloaf', 'Warm bread by six', 'Order tonight & wake up to it.', 'Order now'];
    const edit = readPageEdit(readPageCopy(PAGE), edited.join('\n'));
    if (!edit.ok) throw new Error(edit.problem);
    const placed = placePageEdit(PAGE, edit);
    expect(placed.problems).toEqual([]);
    expect(pageCopy(placed.page)).toEqual(edited);
    expect(pageEditProblems(PAGE, placed.page, edit, placed)).toEqual([]);
    expect(placed.page).toContain('Order tonight &amp; wake up to it.');
    // Formatting follows the words it held: a line rewritten with none of its old words keeps none of its emphasis.
    expect(placed.page).toContain('<h1>Warm bread by six</h1>');
  });

  it('refuses a write-back that changed markup or left out a line, and an answer with a line too few', () => {
    const edit = readPageEdit(readPageCopy(PAGE), pageCopy(PAGE).join('\n'));
    if (!edit.ok) throw new Error(edit.problem);
    const placed = placePageEdit(PAGE, edit);
    expect(pageEditProblems(PAGE, PAGE.replace('class="cta"', 'class="cta big"'), edit, placed)[0]).toMatch(/beyond its text/);
    expect(readPageEdit(readPageCopy(PAGE), 'too few')).toMatchObject({ ok: false });
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

  it('a storyboard’s late VOICE is its on-screen copy; the locked voice-over is not offered and cannot change (VOICE-1)', () => {
    const sb = JSON.stringify({
      storyboard: [
        { shot: 1, description: 'Open', imagePrompt: 'Hands', durationSec: 3, caption: 'Again?', imageArtifactId: 'sha256:a' },
        { shot: 2, description: 'Close', imagePrompt: 'Cup', durationSec: 4 },
      ],
      voiceover: 'Less time on the road.',
      headline: 'Time, handed back.',
    });
    // The early VOICE is the script; the late one the headline, the tagline and each shot's caption.
    expect(extractCopy('media', sb, 'script')).toBe('Less time on the road.');
    const copy = extractCopy('media', sb, 'on-screen');
    expect(copy).toBe('Headline: Time, handed back.\nTagline: \nShot 1: Again?\nShot 2: ');
    const back = applyCopy('media', sb, 'Headline: Less waiting.\nTagline: Made for mornings.\nShot 1: Again?\nShot 2: Yours, every day.', 'on-screen');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const out = JSON.parse(back.value);
    expect(out).toMatchObject({ headline: 'Less waiting.', tagline: 'Made for mornings.', voiceover: 'Less time on the road.' });
    expect(out.storyboard).toMatchObject([{ caption: 'Again?', imageArtifactId: 'sha256:a' }, { caption: 'Yours, every day.' }]);
    // The voice-over is locked after the script step.
    expect(applyCopy('media', sb, `${copy}\nVoice-over: Something else.`, 'on-screen')).toMatchObject({ ok: false });
    expect(applyCopy('media', sb, 'Shot 9: Nowhere.', 'on-screen')).toMatchObject({ ok: false });
  });
});

describe('VOICE total readers and the round trip (F07)', () => {
  const OPTIONS = serializeJson({
    options: [
      { title: 'Bread club', pitch: 'Fresh bread at seven.', rationale: 'Mornings matter.' },
      { title: 'Weekend box', pitch: 'A box on Saturday.', rationale: 'Weekends are slow.' },
    ],
  });
  const deck = extractCopy('options', OPTIONS);
  const options = (answer: string) => {
    const r = applyCopy('options', OPTIONS, answer);
    if (!r.ok) return { rejected: r.problem };
    return { stored: (JSON.parse(r.value) as { options: { title: string; pitch: string }[] }).options.map((o) => `${o.title} | ${o.pitch}`), roundTrip: roundTripProblem('options', 'script', r.value, answer) === undefined };
  };

  it('options: every line lands in one field, or the answer is refused with the line named', () => {
    expect(options(deck)).toEqual({ stored: ['Bread club | Fresh bread at seven.', 'Weekend box | A box on Saturday.'], roundTrip: true });
    expect(options(`Lead with the club; it is cheaper.\n\n${deck}`).rejected).toMatch(/^Line 1 \("Lead with the club; it is cheaper\."\) is not under a field/);
    expect(options(deck.replace('### A\n', '### A\nAvailable in every shop from May.\n')).rejected).toMatch(/^Line 2 /);
    expect(options(deck.replace('Pitch: Fresh bread at seven.', 'Pitch: Fresh bread at seven.\nPitch: Now with oat loaves.')).rejected).toMatch(/^Option A "Pitch:" appears twice/);
    expect(options(deck.split('\n\n')[0]!).rejected).toMatch(/^### B is missing/);
    expect(options(deck.replace('Pitch: A box on Saturday.', 'Pitch:')).rejected).toMatch(/^Option B needs a title, a pitch and a rationale/);
    expect(options(deck.replace('Title: Bread club\nPitch: Fresh bread at seven.', 'Pitch: Fresh bread at seven.\nTitle: Bread club')).rejected).toBe('Keep the lines in the order shown.');
  });

  it('options: layout variants are read and pass the round trip', () => {
    expect(options(deck.replace('Pitch: Fresh bread at seven.', 'Pitch: Fresh bread at seven.\nNow with oat loaves.'))).toEqual({ stored: ['Bread club | Fresh bread at seven.\nNow with oat loaves.', 'Weekend box | A box on Saturday.'], roundTrip: true });
    for (const v of [deck.replace('Pitch: Fresh bread at seven.', 'Pitch:\n\nFresh bread at seven.'), deck.replace('Title: Bread club', 'title:Bread club'), deck.replace('\n\n', '\n').replace(/\n/g, '\r\n'), deck.replace('Mornings matter.', 'Mornings matter.\n\nThey always have.')]) {
      expect(options(v)).toMatchObject({ roundTrip: true });
    }
    // A reader that dropped a line (the old parseOptionCopy kept only what followed "###") fails the round trip, and
    // the refusal names the first line that would differ.
    expect(roundTripProblem('options', 'script', OPTIONS, `Lead with the club.\n\n${deck}`)).toBe('byway could not write your words back exactly as you wrote them, from the line "Lead with the club." on. Leave that line as it was offered, or write it another way.');
  });

  it('a run of blank lines that ends at a label is layout, however long; blank lines inside a value are kept', () => {
    for (const v of [deck.replace('\n\n### B', '\n\n\n### B'), deck.replace('\n\n### B', '\n\n\n\n### B'), deck.replace('\nPitch: Fresh', '\n\n\nPitch: Fresh'), deck.replace(/\n/g, '\r\n').replace('\r\n\r\n### B', '\r\n  \r\n\r\n### B')]) {
      expect(layoutOf('options', v), JSON.stringify(v)).toBe(layoutOf('options', deck));
      expect(sameCopy('options', 'script', deck, v)).toBe(true);
      expect(options(v.replace('A box on Saturday.', 'A box on Sunday.'))).toEqual({ stored: ['Bread club | Fresh bread at seven.', 'Weekend box | A box on Sunday.'], roundTrip: true });
    }
    expect(layoutOf('options', 'Rationale: a\n\n\n### B')).toBe('Rationale: a\n### B');
    expect(layoutOf('options', 'Rationale: a\n\n\nmore\n\n\n### B')).toBe('Rationale: a\n\n\nmore\n### B');
    expect(layoutOf('on-screen', 'Headline: Go\n\n\nTagline: Shoes\n\n')).toBe('Headline: Go\nTagline: Shoes');
  });

  const SB = serializeJson({
    concept: 'c',
    voiceover: 'Bread before seven.',
    headline: 'Fresh at seven',
    tagline: 'Bread club',
    storyboard: [
      { shot: 1, description: 'oven', imagePrompt: 'oven', durationSec: 3, caption: 'Hot bread' },
      { shot: 2, description: 'door', imagePrompt: 'door', durationSec: 3, caption: 'At your door' },
    ],
  });
  const onScreen = extractCopy('media', SB, 'on-screen');
  const screen = (answer: string) => {
    const r = applyCopy('media', SB, answer, 'on-screen');
    if (!r.ok) return { rejected: r.problem };
    const after = JSON.parse(r.value) as { headline?: string; storyboard: { caption?: string }[] };
    return { headline: after.headline ?? null, captions: after.storyboard.map((s) => s.caption ?? null), roundTrip: roundTripProblem('media', 'on-screen', r.value, answer) === undefined };
  };

  it('the late storyboard VOICE: Headline, Tagline and one "Shot N:" per shot, each once, in order', () => {
    expect(screen(onScreen)).toEqual({ headline: 'Fresh at seven', captions: ['Hot bread', 'At your door'], roundTrip: true });
    expect(screen(onScreen.replace('Shot 1: Hot bread', 'Shot 1: Hot bread\nShot 1: Still warm')).rejected).toMatch(/^"Shot 1:" appears twice/);
    expect(screen(onScreen.replace('\nShot 2: At your door', '')).rejected).toMatch(/^"Shot 2:" is missing/);
    expect(screen(`Make it warmer.\n${onScreen}`).rejected).toMatch(/^Line 1 \("Make it warmer\."\) is not under a field/);
    expect(screen(`${onScreen}\nVoice-over: Bread now.`).rejected).toMatch(/voice-over was locked/);
    expect(screen(onScreen.replace('Headline: Fresh at seven\nTagline: Bread club', 'Tagline: Bread club\nHeadline: Fresh at seven')).rejected).toBe('Keep the lines in the order shown.');
    expect(screen(onScreen.replace('Headline: Fresh at seven', 'Headline:'))).toEqual({ headline: null, captions: ['Hot bread', 'At your door'], roundTrip: true });
    expect(screen(onScreen.replace('Shot 1: Hot bread', 'Shot 1: Hot bread\n\n  still warm'))).toEqual({ headline: 'Fresh at seven', captions: ['Hot bread\n\n  still warm', 'At your door'], roundTrip: true });
  });

  it('prose and code diffs round-trip as text; a paragraph split is a change', () => {
    expect(layoutOf('prose', '# A\n\nB C.\n')).not.toBe(layoutOf('prose', '# A\n\nB\n\nC.'));
    expect(roundTripProblem('prose', 'script', '# A\n\nB\n\nC.\n', '# A\n\nB\n\nC.')).toBeUndefined();
    const cd = joinCodeDiff({ diff: '--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y', why: 'Why: old reason' });
    const written = applyCopy('code-diff', cd, 'A new reason.');
    expect(written.ok && roundTripProblem('code-diff', 'script', written.value, 'A new reason.')).toBeUndefined();
  });

  it('"unchanged" is layout only: a value on the next line is not a change; a doubled space inside a value is', () => {
    const answer = 'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Hot bread\nShot 2: Oven\nShot 3: Your door';
    expect(sameCopy('media', 'on-screen', answer, 'Headline:\n\nFresh at seven\nTagline: Bread club\nShot 1: Hot bread\nShot 2: Oven\nShot 3: Your door')).toBe(true);
    expect(sameCopy('media', 'on-screen', answer, 'headline:\nFresh at seven\ntagline: Bread club\n\nshot 1: Hot bread\nShot 2:   Oven  \nShot 3: Your door\n')).toBe(true);
    expect(sameCopy('media', 'on-screen', answer, answer.replace('Hot bread', 'Hot  bread'))).toBe(false);
    expect(sameCopy('prose', 'script', 'A B.', 'A\n\nB.')).toBe(false);
  });
});

describe('keepsVoice: the deck locked at VOICE (F07)', () => {
  type Sb = { voiceover: string; headline?: string; tagline?: string; storyboard: { shot: number; caption?: string; description?: string; clipArtifactId?: string }[] };
  const sb = (v: Sb) => serializeJson({ ...v, storyboard: v.storyboard.map((s) => ({ shot: s.shot, description: s.description ?? `d${s.shot}`, imagePrompt: `p${s.shot}`, durationSec: 3, ...(s.caption !== undefined ? { caption: s.caption } : {}), ...(s.clipArtifactId ? { clipArtifactId: s.clipArtifactId } : {}) })) });
  const shots = (...caps: (string | undefined)[]) => caps.map((caption, i) => ({ shot: i + 1, ...(caption !== undefined ? { caption } : {}) }));
  const run = (voice: string | undefined, before: string | undefined, after: string) => {
    const r = lockCopy('media', voice, before)(after);
    const out = JSON.parse(r.text) as Sb;
    return { problems: r.problems, restored: r.restored, shots: out.storyboard.length, voiceover: out.voiceover, text: r.text };
  };
  const LOCKED = /The on-screen copy is the person's/;

  describe('the script phase (canonical C5: every keepsVoice writer runs with the VO script as its voice)', () => {
    const voice = 'Shot 1: Bread before seven.\nShot 2: Still warm.\nShot 3: At your door.';
    const before = sb({ voiceover: voice, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: shots('Hot bread', 'Oven', 'Your door') });

    it('a first-pass cut on a shot-labelled script is stored with nothing locked (s1); a caption swap is kept (s2)', () => {
      const cut = sb({ voiceover: voice, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'Your door', description: 'd3' }] });
      expect(run(voice, before, cut)).toMatchObject({ problems: [], restored: [], shots: 2 });
      const swapped = sb({ voiceover: voice, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: shots('Warm loaves', 'Oven', 'Your door') });
      expect(run(voice, before, swapped)).toMatchObject({ problems: [], restored: [] });
    });

    it('an appended or reordered voice-over is written back (s3, s4); the operators e2e case too (s5)', () => {
      const appended = sb({ voiceover: `${voice} Now 50% off!`, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: shots('Hot bread', 'Oven', 'Your door') });
      expect(run(voice, before, appended)).toMatchObject({ problems: [], restored: ['voice-over'], voiceover: voice });
      const reordered = sb({ voiceover: 'Shot 2: Still warm.\nShot 1: Bread before seven.\nShot 3: At your door.', headline: 'Fresh at seven', tagline: 'Bread club', storyboard: shots('Hot bread', 'Oven', 'Your door') });
      expect(run(voice, before, reordered)).toMatchObject({ problems: [], restored: ['voice-over'], voiceover: voice });
      const script = 'Less time on the road.\nMore time on the trail.';
      expect(run(script, sb({ voiceover: script, storyboard: shots('Trail') }), sb({ voiceover: 'Run further, faster, freer.', storyboard: shots('Trail') }))).toMatchObject({ problems: [], restored: ['voice-over'], voiceover: script });
    });

    it('an obedient write is byte-identical, with nothing restored (s6)', () => {
      const clip = sb({ voiceover: voice, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread', clipArtifactId: 'sha256:c1' }, { shot: 2, caption: 'Oven' }, { shot: 3, caption: 'Your door' }] });
      const r = run(voice, before, clip);
      expect(r).toMatchObject({ problems: [], restored: [] });
      expect(r.text).toBe(clip);
    });

    it('after a gate retry D2 runs with the script as its voice again, and a cut is stored (g1)', () => {
      const script = 'Bread before seven. Still warm at your door.';
      const b = sb({ voiceover: script, headline: 'Model headline', tagline: 'Model tagline', storyboard: shots('Model cap 1', 'Model cap 2', 'Model cap 3') });
      const cut = sb({ voiceover: script, headline: 'Model headline', tagline: 'Model tagline', storyboard: [{ shot: 1, caption: 'Model cap 1' }, { shot: 2, caption: 'Model cap 3', description: 'd3' }] });
      expect(run(script, b, cut)).toMatchObject({ problems: [], restored: [], shots: 2 });
    });
  });

  describe('the on-screen phase (composed recipes only: a writer after the late VOICE)', () => {
    const script = 'Bread before seven. Still warm at your door.';
    const answer = 'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Hot bread\nShot 2: Oven\nShot 3: Your door';
    const before = sb({ voiceover: script, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: shots('Hot bread', 'Oven', 'Your door') });
    const variant = (o: Partial<Sb>) => sb({ voiceover: script, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: shots('Hot bread', 'Oven', 'Your door'), ...o });
    const captionChanged = variant({ storyboard: shots('Hot bread, 50% off', 'Oven', 'Your door') });

    it('a changed caption or headline, a removed, added or uncaptioned shot are refused', () => {
      for (const after of [
        captionChanged,
        variant({ headline: 'Fresh at seven!' }),
        variant({ storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'Your door', description: 'd3' }] }),
        variant({ storyboard: shots('Hot bread', 'Oven') }),
        variant({ storyboard: shots('Hot bread', 'Oven', 'Your door', 'Now 50% off') }),
      ]) {
        expect(run(answer, before, after).problems).toEqual([expect.stringMatching(LOCKED)]);
      }
      const b2 = sb({ voiceover: script, headline: 'Fresh at seven', storyboard: shots('Hot bread', undefined) });
      expect(run('Headline: Fresh at seven\nTagline:\nShot 1: Hot bread\nShot 2:', b2, sb({ voiceover: script, headline: 'Fresh at seven', storyboard: shots('Hot bread') })).problems).toEqual([expect.stringMatching(LOCKED)]);
    });

    it('a voice-over-only change is written back; a clip attach passes', () => {
      expect(run(answer, before, variant({ voiceover: `${script} Guaranteed.` }))).toMatchObject({ problems: [], restored: ['voice-over'], voiceover: script });
      expect(run(answer, before, variant({ storyboard: [{ shot: 1, caption: 'Hot bread', clipArtifactId: 'sha256:c1' }, { shot: 2, caption: 'Oven' }, { shot: 3, caption: 'Your door' }] }))).toMatchObject({ problems: [], restored: [] });
    });

    it('layout drift in the late answer does not switch the lock off (d_*)', () => {
      for (const drift of [
        'Headline:\n\nFresh at seven\nTagline: Bread club\nShot 1: Hot bread\nShot 2: Oven\nShot 3: Your door',
        'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Hot bread\n   still warm\nShot 2: Oven\nShot 3: Your door',
        'headline:\nFresh at seven\ntagline: Bread club\n\nshot 1: Hot bread\nShot 2:   Oven  \nShot 3: Your door\n',
        answer.replace('Hot bread', 'Hot  bread'),
      ]) {
        expect(run(drift, before, captionChanged).problems).toEqual([expect.stringMatching(LOCKED)]);
      }
    });

    it('an old late answer that left a field out stays unlocked (the in-flight residual)', () => {
      expect(run('Headline: Fresh at seven\nShot 1: Hot bread\nShot 2: Oven\nShot 3: Your door', before, captionChanged).problems).toEqual([]);
    });
  });

  it('coincidences: a VO script that is the whole labelled deck stays unlocked in the script phase; one labelled for other shots too', () => {
    const deck = 'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Hot bread\nShot 2: Oven';
    const before = sb({ voiceover: deck, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: shots('Hot bread', 'Oven') });
    expect(run(deck, before, sb({ voiceover: deck, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: shots('Hot bread') })).problems).toEqual([]);
    const vo = 'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Hot bread';
    expect(run(vo, sb({ voiceover: vo, headline: 'x', tagline: 'y', storyboard: shots('a', 'b') }), sb({ voiceover: vo, headline: 'x', tagline: 'y', storyboard: shots('a') })).problems).toEqual([]);
  });

  it('options, prose and code diffs: any change to the deck is refused; an empty voice is a voice', () => {
    const options = serializeJson({ options: [{ title: 'Wedge', pitch: 'Small', rationale: 'Testable' }] });
    expect(lockCopy('options', '### A\nTitle: Wedge', options)(options.replace('Small', 'Small and sharp')).problems).toEqual([expect.stringMatching(/exactly as written/)]);
    // A mood image attached to an option leaves its copy as it was.
    expect(lockCopy('options', '### A\nTitle: Wedge', options)(serializeJson({ options: [{ title: 'Wedge', pitch: 'Small', rationale: 'Testable', imageArtifactId: 'sha256:x' }] })).problems).toEqual([]);
    expect(lockCopy('prose', 'Mine.', '# Memo\n\nMine.\n')('# Memo\n\nMine. Now 50% off!\n').problems).toHaveLength(1);
    expect(lockCopy('prose', '', '# Memo\n\nMine.\n')('# Memo\n\nMine. Guaranteed.\n').problems).toHaveLength(1);
    const diff = joinCodeDiff({ diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b', why: 'Why: mine.' });
    expect(lockCopy('code-diff', 'Why: mine.', diff)(joinCodeDiff({ diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+c', why: 'Why: mine.' })).problems).toEqual([]);
    expect(lockCopy('code-diff', 'Why: mine.', diff)(joinCodeDiff({ diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+c', why: 'Why: mine, and faster.' })).problems).toHaveLength(1);
    // No VOICE yet: nothing is locked.
    expect(lockCopy('prose', undefined, '# Memo\n')('# Other\n').problems).toEqual([]);
  });

  it('with no work before the write, the written deck must be the voice exactly', () => {
    expect(lockCopy('prose', '# Mine\n\nAll mine.', undefined)('# Mine\n\nAll mine.\n').problems).toEqual([]);
    expect(lockCopy('prose', '# Mine\n\nAll mine.', undefined)('# Mine\n\nAll mine. And more.\n').problems).toHaveLength(1);
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
