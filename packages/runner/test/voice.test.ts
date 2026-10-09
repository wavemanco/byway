/**
 * VOICE writes the person's copy exactly, without a model (F07, ADR-0081), and keepsVoice holds it exactly against
 * later machine writes. Activities on their own, against a temp store and a scripted gateway that records every call.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnswerRejected, StepError } from '../src/activities/failures.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { relayLink } from '../src/activities/relay.ts';
import { pageCopy, pageLockView } from '../src/copy.ts';
import { joinCodeDiff, serializeJson, splitCodeDiff } from '../src/formats.ts';
import type { StepSpec } from '../src/types.ts';
import { benchRun, putWork, storyboard, voiceBench, VoiceQuestion, voiceStep, type VoiceBench } from './helpers/voice-activity.ts';

let b: VoiceBench;
beforeEach(async () => {
  b = await voiceBench();
});
afterEach(() => b.close());

const json = async (id: string) => JSON.parse(await b.store.artifacts.getText(id)) as Record<string, unknown>;
const rejected = (p: Promise<unknown>) => p.then(
  () => {
    throw new Error('expected the answer to be refused');
  },
  (e: unknown) => {
    expect(e).toBeInstanceOf(AnswerRejected);
    return (e as Error).message;
  },
);

const OPTIONS = serializeJson({
  options: [
    { title: 'Bread club', pitch: 'Fresh bread at seven.', rationale: 'Mornings matter.' },
    { title: 'Weekend box', pitch: 'A box on Saturday.', rationale: 'Weekends are slow.' },
  ],
});

describe('VOICE on options: a total reader, no model (F07)', () => {
  const open = async () => {
    const run = await benchRun(b, 'options');
    return VoiceQuestion.open(b, run, await putWork(b, 'options', OPTIONS));
  };

  it('stores a changed field exactly, with no model call', async () => {
    const q = await open();
    const out = await q.answer(q.offered!.replace('Pitch: Fresh bread at seven.', 'Pitch: Fresh bread at six.'));
    expect(((await json(out.artifactId!)).options as { pitch: string }[])[0]!.pitch).toBe('Fresh bread at six.');
    expect(out.costUsd).toBe(0);
    expect(b.gateway.requests).toEqual([]);
  });

  it('refuses a line before the first label, naming it, instead of dropping it', async () => {
    const q = await open();
    const msg = await rejected(q.answer(`Lead with the club; it is cheaper.\n\n${q.offered}`));
    expect(msg).toMatch(/Line 1 \("Lead with the club; it is cheaper\."\) is not under a field/);
    expect(b.gateway.requests).toEqual([]);
    expect(await b.store.events(q.run.runId)).not.toContainEqual(expect.objectContaining({ type: 'artifact' }));
  });

  it('refuses a line between a label and its fields', async () => {
    const q = await open();
    const msg = await rejected(q.answer(q.offered!.replace('### A\n', '### A\nAvailable in every shop from May.\n')));
    expect(msg).toMatch(/Line 2 \("Available in every shop from May\."\) is not under a field/);
    expect(b.gateway.requests).toEqual([]);
  });

  it('refuses a second "Pitch:", quoting how that field was first offered', async () => {
    const q = await open();
    const msg = await rejected(q.answer(q.offered!.replace('Pitch: Fresh bread at seven.', 'Pitch: Fresh bread at seven.\nPitch: Now with oat loaves.')));
    expect(msg).toMatch(/Option A "Pitch:" appears twice/);
    expect(msg).toMatch(/As first offered, line 3 read "Pitch: Fresh bread at seven\."/);
  });

  it('refuses a deleted block, a blanked pitch and reordered fields', async () => {
    const q = await open();
    expect(await rejected(q.answer(q.offered!.split('\n\n')[0]!))).toMatch(/### B is missing/);
    expect(await rejected(q.answer(q.offered!.replace('Pitch: A box on Saturday.', 'Pitch:')))).toMatch(/Option B needs a title, a pitch and a rationale/);
    expect(await rejected(q.answer(q.offered!.replace('Title: Bread club\nPitch: Fresh bread at seven.', 'Pitch: Fresh bread at seven.\nTitle: Bread club')))).toMatch(/order shown/);
    expect(b.gateway.requests).toEqual([]);
  });

  it('stores layout variants: continuation lines, a value on the next line, "title:" with no space, CRLF, a paragraph', async () => {
    const deck = (await open()).offered!;
    for (const answer of [
      deck.replace('Pitch: Fresh bread at seven.', 'Pitch: Fresh bread at seven.\nNow with oat loaves.'),
      deck.replace('Rationale: Mornings matter.', 'Rationale: Mornings matter.\n\nThey always have.'),
    ]) {
      const out = await (await open()).answer(answer);
      expect(out.artifactId).toBeDefined();
    }
    // Layout only: nothing is written.
    for (const answer of [deck.replace('Pitch: Fresh bread at seven.', 'Pitch:\n\nFresh bread at seven.'), deck.replace('Title: Bread club', 'title:Bread club'), deck.replace('\n\n', '\n').replace(/\n/g, '\r\n')]) {
      expect((await (await open()).answer(answer)).artifactId).toBeUndefined();
    }
    expect(b.gateway.requests).toEqual([]);
  });

  // Blank lines are layout wherever a run of them ends at a label, however long the run (r2: two or more were refused).
  const blankRuns = (deck: string) => [
    deck.replace('\n\n### B', '\n\n\n### B'),
    deck.replace('\n\n### B', '\n\n\n\n### B'),
    deck.replace('\nPitch: Fresh', '\n\n\nPitch: Fresh'),
    deck.replace('\nPitch: Fresh', '\n\n\n\nPitch: Fresh'),
    deck.replace(/\n/g, '\r\n').replace('\r\n\r\n### B', '\r\n \r\n\t\r\n### B'),
    `\n\n${deck}\n\n\n`,
  ];

  it('blank-line runs before a label are layout: nothing is written, and an edit beside them is stored', async () => {
    const deck = (await open()).offered!;
    for (const answer of blankRuns(deck)) {
      expect((await (await open()).answer(answer)).artifactId, JSON.stringify(answer)).toBeUndefined();
      const out = await (await open()).answer(answer.replace('Weekends are slow.', 'Weekends are quiet.'));
      expect(((await json(out.artifactId!)).options as { rationale: string }[]).map((o) => o.rationale), JSON.stringify(answer)).toEqual(['Mornings matter.', 'Weekends are quiet.']);
    }
    expect(b.gateway.requests).toEqual([]);
  });
});

describe('VOICE on a storyboard (F07)', () => {
  const SB = storyboard({ voiceover: 'Bread before seven.', headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'At your door' }] });
  const late = async (sb = SB) => VoiceQuestion.open(b, await benchRun(b, 'media'), await putWork(b, 'media', sb));

  it('refuses a duplicate or dropped "Shot N:", a preamble and a voice-over line, with no model call', async () => {
    const q = await late();
    const deck = q.offered!;
    expect(await rejected(q.answer(deck.replace('Shot 1: Hot bread', 'Shot 1: Hot bread\nShot 1: Still warm')))).toMatch(/"Shot 1:" appears twice/);
    expect(await rejected(q.answer(deck.replace('\nShot 2: At your door', '')))).toMatch(/"Shot 2:" is missing/);
    expect(await rejected(q.answer(`Make it warmer.\n${deck}`))).toMatch(/Line 1 \("Make it warmer\."\) is not under a field/);
    expect(await rejected(q.answer(`${deck}\nVoice-over: Bread now.`))).toMatch(/voice-over was locked/);
    expect(b.gateway.requests).toEqual([]);
  });

  it('writes a doubled space inside a caption (a change), and nothing for a layout-only answer', async () => {
    const q = await late();
    const out = await q.answer(q.offered!.replace('Hot bread', 'Hot  bread'));
    expect(((await json(out.artifactId!)).storyboard as { caption?: string }[])[0]!.caption).toBe('Hot  bread');
    const again = await late();
    expect((await again.answer(again.offered!.replace('Headline: Fresh at seven', 'headline:\n\nFresh at seven'))).artifactId).toBeUndefined();
  });

  it('two or three blank lines between fields are layout: a caption edit beside them is stored', async () => {
    for (const gap of ['\n\n\n', '\n\n\n\n', '\r\n\r\n\r\n']) {
      const q = await late();
      const answer = q.offered!.replace('\nTagline:', `${gap}Tagline:`);
      const again = await late();
      expect((await again.answer(answer)).artifactId).toBeUndefined();
      const out = await q.answer(answer.replace('Hot bread', 'Warm bread'));
      expect(((await json(out.artifactId!)).storyboard as { caption?: string }[]).map((s) => s.caption)).toEqual(['Warm bread', 'At your door']);
    }
  });

  it('a cleared headline and a two-line caption are stored', async () => {
    const q = await late();
    const out = await q.answer(q.offered!.replace('Headline: Fresh at seven', 'Headline:').replace('Shot 1: Hot bread', 'Shot 1: Hot bread\n\n  still warm'));
    const sb = await json(out.artifactId!);
    expect(sb.headline).toBeUndefined();
    expect((sb.storyboard as { caption?: string }[])[0]!.caption).toBe('Hot bread\n\n  still warm');
    expect(sb.voiceover).toBe('Bread before seven.');
  });

  it('reads shots by position, so a storyboard with two shots numbered 2 can still be edited', async () => {
    const q = await late(storyboard({ voiceover: 'v', storyboard: [{ shot: 1, caption: 'a' }, { shot: 2, caption: 'b' }, { shot: 2, caption: 'c' }] }));
    const out = await q.answer(q.offered!.replace('Shot 2: c', 'Shot 2: see'));
    expect(((await json(out.artifactId!)).storyboard as { caption?: string }[]).map((s) => s.caption)).toEqual(['a', 'b', 'see']);
  });

  it('the early VOICE writes the script exactly', async () => {
    const run = await benchRun(b, 'media');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'media', SB), voiceStep({ variant: 'VOICE-early' }));
    expect(q.offered).toBe('Bread before seven.');
    const out = await q.answer('Bread before seven.\nStill warm at your door.');
    expect((await json(out.artifactId!)).voiceover).toBe('Bread before seven.\nStill warm at your door.');
  });
});

describe('VOICE on prose and code diffs (F07)', () => {
  it('a prose paragraph split is stored, not dropped as "unchanged"', async () => {
    const run = await benchRun(b, 'prose');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'prose', '# Memo\n\nWe migrate on Friday. Nothing changes for you.\n'));
    const out = await q.answer('# Memo\n\nWe migrate on Friday.\n\nNothing changes for you.');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe('# Memo\n\nWe migrate on Friday.\n\nNothing changes for you.\n');
  });

  it('empty prose and an empty Why are refused', async () => {
    const prose = await VoiceQuestion.open(b, await benchRun(b, 'prose'), await putWork(b, 'prose', '# Memo\n'));
    expect(await rejected(prose.answer('  \n'))).toMatch(/empty/);
    const diff = joinCodeDiff({ diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b', why: 'Why: old.' });
    const cd = await VoiceQuestion.open(b, await benchRun(b, 'code-diff'), await putWork(b, 'code-diff', diff));
    expect(await rejected(cd.answer('Why:'))).toMatch(/empty/);
    const out = await cd.answer('Why: the old one leaked.');
    expect(splitCodeDiff(await b.store.artifacts.getText(out.artifactId!)).why).toBe('Why: the old one leaked.');
    expect(b.gateway.requests).toEqual([]);
  });

  it('a claim-log VOICE on a run that is not prose offers, and writes, the copy deck', async () => {
    const run = await benchRun(b, 'options');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'options', OPTIONS), voiceStep({ variant: 'claim-log' }), 'claims');
    expect(q.offered).toMatch(/^### A\nTitle: Bread club\n/);
    const out = await q.answer(q.offered!.replace('Title: Bread club', 'Title: The bread club'));
    expect(((await json(out.artifactId!)).options as { title: string }[])[0]!.title).toBe('The bread club');
  });

  it('a store that fails to write is retried (a plain error), not asked again', async () => {
    const run = await benchRun(b, 'prose');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'prose', '# Memo\n'));
    const putText = b.store.artifacts.putText.bind(b.store.artifacts);
    b.store.artifacts.putText = async () => {
      throw new Error('disk busy');
    };
    const err = await q.answer('# Memo\n\nMine.').catch((e: unknown) => e);
    b.store.artifacts.putText = putText;
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AnswerRejected);
    expect(err).not.toBeInstanceOf(StepError);
  });
});

describe('keepsVoice holds the person’s words exactly (F07)', () => {
  const fixSpec: StepSpec = { id: 'apply-cut', role: 'fix', block: 'CUT', actor: 'model', tier: 'mid', prompt: 'product.test.polish', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, keepsVoice: true };
  const fenced = (text: string) => '```json\n' + text + '\n```';
  const script = 'Shot 1: Bread before seven.\nShot 2: Still warm.\nShot 3: At your door.';
  const before = storyboard({ voiceover: script, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'Oven' }, { shot: 3, caption: 'Your door' }] });
  const fix = async (medium: Parameters<typeof benchRun>[1], beforeText: string, answer: string, voice: string | undefined) => {
    const run = await benchRun(b, medium);
    const artifact = await putWork(b, medium, beforeText);
    b.gateway.requests.length = 0;
    const scripted = [answer, answer];
    b.gateway.complete = async (req) => {
      b.gateway.requests.push(req);
      return { text: scripted.shift() ?? '', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: `l${b.gateway.requests.length}` };
    };
    const out = await modelStep(b.deps, { run, call: { key: `${run.runId}/apply-cut/-/1`, stepId: 'apply-cut', stage: 'D3' }, step: fixSpec, ports: { artifact, critique: '- Cut shot 2.', ...(voice !== undefined ? { voice } : {}) }, refs: [] });
    const finished = (await b.store.events(run.runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
    return { out, finished, run };
  };

  it('a voice-over the model appended to is written back as the person wrote it, and the step says so', async () => {
    const appended = before.replace('Shot 3: At your door.', 'Shot 3: At your door. Now 50% off!');
    const { out, finished } = await fix('media', before, fenced(appended), script);
    expect(b.gateway.requests).toHaveLength(1);
    expect((await json(out.artifactId!)).voiceover).toBe(script);
    expect(finished[0]).toMatch(/voice-over .*kept exactly/i);
  });

  it('a reordered voice-over is written back too', async () => {
    const reordered = before.replace(JSON.stringify(script), JSON.stringify('Shot 2: Still warm.\nShot 1: Bread before seven.\nShot 3: At your door.'));
    const { out } = await fix('media', before, fenced(reordered), script);
    expect((await json(out.artifactId!)).voiceover).toBe(script);
  });

  it('a first-pass cut on a shot-labelled script is stored with nothing locked; an obedient write gets no note', async () => {
    const cut = storyboard({ voiceover: script, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'Your door', description: 'd3' }] });
    const { out, finished } = await fix('media', before, fenced(cut), script);
    expect(((await json(out.artifactId!)).storyboard as unknown[]).length).toBe(2);
    expect(finished[0]).toBeUndefined();
    expect(b.gateway.requests).toHaveLength(1);
  });

  it('on-screen copy accepted at a late VOICE is locked: a changed caption is refused (composed recipes)', async () => {
    const answer = 'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Hot bread\nShot 2: Oven\nShot 3: Your door';
    const vo = storyboard({ voiceover: 'Bread before seven.', headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'Oven' }, { shot: 3, caption: 'Your door' }] });
    const changed = vo.replace('"Hot bread"', '"Hot bread, 50% off"');
    await expect(fix('media', vo, fenced(changed), answer)).rejects.toThrow(/on-screen copy is the person's/);
  });

  it('options, prose and code-diff decks that change are refused', async () => {
    const opt = OPTIONS.replace('Fresh bread at seven.', 'Fresh bread at seven, guaranteed.');
    await expect(fix('options', OPTIONS, fenced(opt), '### A\nTitle: Bread club')).rejects.toThrow(/exactly as written/);
    await expect(fix('prose', '# Memo\n\nMine.\n', '# Memo\n\nMine. Now 50% off!', 'Mine.')).rejects.toThrow(/exactly as written/);
  });

  it('an empty voice is checked too', async () => {
    await expect(fix('prose', '# Memo\n\nMine.\n', '# Memo\n\nMine. Guaranteed.', '')).rejects.toThrow(/exactly as written/);
  });

  it('a relay link that only attaches its clip is stored byte for byte, with no note', async () => {
    const run = await benchRun(b, 'media');
    const artifact = await putWork(b, 'media', before);
    b.gateway.complete = async () => ({ text: '```json\n{"clipPrompt":"Shot 1: go","durationSec":3}\n```', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: 'l1' });
    b.gateway.video = async () => {
      const clip = await b.store.artifacts.putText('<svg/>', 'image/svg+xml');
      const frame = await b.store.artifacts.put(new Uint8Array([137, 80, 78, 71]), 'image/png');
      return { artifactId: clip.id, mediaType: 'image/svg+xml', lastFrameArtifactId: frame.id, lastFrameMediaType: 'image/png', costUsd: 0, servedModel: 'mock', provider: 'mock', ledgerEntryId: 'v1' };
    };
    const relay: StepSpec = { id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', prompt: 'product.test.clip', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true, keepsVoice: true };
    const out = await relayLink(b.deps, { run, call: { key: `${run.runId}/clip/-/1`, stepId: 'clip', stage: 'D2' }, step: relay, ports: { artifact, voice: script }, shot: 1 });
    const stored = await json(out.artifactId!);
    expect(stored.voiceover).toBe(script);
    expect(((stored.storyboard as { clipArtifactId?: string }[])[0]!.clipArtifactId)).toBeDefined();
    const notes = (await b.store.events(run.runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
    expect(notes).toEqual([undefined]);
  });
});

describe('VOICE on a web page: deterministic, no model (F07)', () => {
  const page = (b: string) => `<!doctype html><html><head><title>T</title></head><body>${b}</body></html>\n`;
  const open = async (html: string) => VoiceQuestion.open(b, await benchRun(b, 'web-page'), await putWork(b, 'web-page', html));
  const stored = async (id: string) => (await b.store.artifacts.getText(id)).replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '');

  it('writes deletions, order and link words exactly, with no model call, at no cost', async () => {
    const q = await open(page('<h1>Head</h1><p>Old middle</p><p>Please <a href="/terms">read terms</a> today.</p>'));
    expect(q.offered).toBe('T\nHead\nOld middle\nPlease [read terms] today.');
    const out = await q.answer('T\nNew head\n\nPlease [read the terms] today.');
    expect(await stored(out.artifactId!)).toBe('<h1>New head</h1><p>Please <a href="/terms">read the terms</a> today.</p>');
    expect(out.costUsd).toBe(0);
    expect(b.gateway.requests).toEqual([]);
  });

  it('a page with an out-of-range character reference opens and finishes', async () => {
    const q = await open(page('<p>A &#99999999; B</p><p>Two</p>'));
    expect(q.offered).toBe('T\nA \uFFFD B\nTwo');
    const out = await q.answer('T\nA \uFFFD B\nTwo!');
    expect(await stored(out.artifactId!)).toBe('<p>A &#99999999; B</p><p>Two!</p>');
  });

  it('refusals name the line and quote how it was first offered', async () => {
    const q = await open(page('<p>Please <a href="/terms">read terms</a> today.</p>'));
    const msg = await rejected(q.answer('T\nPlease read the terms today.'));
    expect(msg).toBe('Line 2 has 1 link in [brackets] and your line has 0: keep one pair per link, in order; leave a pair empty, [], to remove its link. As first offered, line 2 read "Please [read terms] today.".');
    expect(b.gateway.requests).toEqual([]);
  });

  it('the prompt says how a page is written and where each link goes, once, on the first offer and on a re-ask', async () => {
    const q = await open(page('<footer><p><a href="/terms">Terms of service</a> · <a href="/privacy">Privacy policy</a></p></footer>'));
    const legend = 'Where each one goes: line 2 "Terms of service" goes to /terms; line 2 "Privacy policy" goes to /privacy.';
    expect(q.prompt).toMatch(/^Write the words yourself: change any line below\. One line per block of text; leave a line empty to remove its text\. Words in \[brackets\] are a link's words/);
    expect(q.prompt!.split(legend)).toHaveLength(2);
    const problem = await rejected(q.answer('T\nTerms · Privacy'));
    const again = await q.ask({ prompt: `${problem} Write the words yourself: change any line below.`, initialText: 'T\nTerms · Privacy' });
    expect(again.prompt.split(legend)).toHaveLength(2);
    expect(again.prompt.split('One line per block of text')).toHaveLength(2);
    const out = await q.answer('T\n[Privacy] · [Terms]', again.checkpointId);
    expect(await stored(out.artifactId!)).toBe('<footer><p><a href="/terms">Privacy</a> · <a href="/privacy">Terms</a></p></footer>');
  });

  it('an in-flight question read differently since it opened: a moved line is refused on the first offer and applied on the re-ask', async () => {
    const html = page('<p>A</p><nav><a href="#1">One</a><a href="#2">Two</a></nav><pre>code</pre>');
    const old = 'T\nA\nOneTwo\ncode';
    const q = await VoiceQuestion.openInFlight(b, await benchRun(b, 'web-page'), await putWork(b, 'web-page', html), old);
    const answer = 'T\nA\nOne and Two\nTwo';
    const problem = await rejected(q.answer(answer));
    expect(problem).toMatch(/^Line 3 was read again since this question opened; it now reads "One": write your change to that line\. As first offered, line 3 read "OneTwo"\./);
    const out = await q.reask(answer, problem, answer);
    expect(await stored(out.artifactId!)).toBe('<p>A</p><nav><a href="#1">One and Two</a><a href="#2">Two</a></nav><pre>code</pre>');
  });

  it('a line beside an image link or an svg social link is written (the link held no words to lose)', async () => {
    const q = await open(page('<h1><a href="/"><img src="logo.png" alt="Bakery"></a> Fresh Bakery</h1><p>Follow us <a href="https://x.com/b"><svg width="10" height="10"></svg></a></p>'));
    expect(q.offered).toBe('T\nFresh Bakery\nFollow us');
    const out = await q.answer('T\nWarm Bakery\nFollow me');
    expect(pageCopy(await b.store.artifacts.getText(out.artifactId!))).toEqual(['T', 'Warm Bakery', 'Follow me']);
    // The space beside each image stays outside its link.
    expect(await stored(out.artifactId!)).toBe('<h1><a href="/"><img src="logo.png" alt="Bakery"></a> Warm Bakery</h1><p>Follow me <a href="https://x.com/b"><svg width="10" height="10"></svg></a></p>');
    expect(b.gateway.requests).toEqual([]);
  });

  it('words added beside a share icon stay outside its link, and the stored page locks the person\'s deck (r3)', async () => {
    const html = page('<p><a href="https://x.com/bakery"><svg width="10" height="10"></svg></a> <a href="/contact">Contact us</a> today</p>');
    const q = await open(html);
    expect(q.offered).toBe('T\n[Contact us] today');
    const out = await q.answer('T\nPlease [Contact us] today');
    const written = await b.store.artifacts.getText(out.artifactId!);
    expect(await stored(out.artifactId!)).toBe('<p><a href="https://x.com/bakery"><svg width="10" height="10"></svg></a> Please <a href="/contact">Contact us</a> today</p>');
    // The lock a later write is held to is the person's deck and the one link they wrote words for.
    expect(JSON.parse(pageLockView(written))).toEqual({ deck: ['T', 'Please [Contact us] today'], links: ['/contact'] });
    expect(b.gateway.requests).toEqual([]);
  });

  it('an answer equal to the offer writes nothing, whatever its whitespace', async () => {
    const q = await open(page('<h1>Head</h1><p>Sub</p>'));
    expect((await q.answer('T\n  Head \nSub\n\n')).artifactId).toBeUndefined();
  });

  it('a claim-log VOICE on a web-page run offers the page deck', async () => {
    const run = await benchRun(b, 'web-page');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'web-page', page('<h1>We launched on 3 May.</h1>')), voiceStep({ variant: 'claim-log' }), 'claims');
    expect(q.offered).toBe('T\nWe launched on 3 May.');
    const out = await q.answer('T\nWe launched on 4 May.');
    expect(await stored(out.artifactId!)).toBe('<h1>We launched on 4 May.</h1>');
  });
});

describe('keepsVoice on a web page (F07)', () => {
  const fixSpec: StepSpec = { id: 'polish', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.polish', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, keepsVoice: true };
  const voiced = '<!doctype html><html><head><title>T</title></head><body><h1>New head</h1><p>Please <a href="/t">read the terms</a> today.</p></body></html>';
  const fix = async (after: string) => {
    const run = await benchRun(b, 'web-page');
    const artifact = await putWork(b, 'web-page', voiced);
    b.gateway.complete = async (req) => {
      b.gateway.requests.push(req);
      return { text: '```html\n' + after + '\n```', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: 'l1' };
    };
    return modelStep(b.deps, { run, call: { key: `${run.runId}/polish/-/1`, stepId: 'polish', stage: 'D3' }, step: fixSpec, ports: { artifact, voice: 'T\nNew head\nPlease [read the terms] today.' }, refs: [] });
  };

  it('refuses a write that adds a claim or retargets a link; a class change passes', async () => {
    await expect(fix(voiced.replace('today.', 'today. Now 50% off!'))).rejects.toThrow(/every line of the page's text/);
    await expect(fix(voiced.replace('href="/t"', 'href="/elsewhere"'))).rejects.toThrow(/every link's words and address/);
    const out = await fix(voiced.replace('<h1>', '<h1 class="big">'));
    expect(await b.store.artifacts.getText(out.artifactId!)).toContain('<h1 class="big">New head</h1>');
  });
});
