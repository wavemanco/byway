/**
 * Human steps and operator questions (spec §3.2): the workflow opens a checkpoint, waits for the person's answer
 * (the RESOLVE_UPDATE Update), and then the answer becomes the step's ports. Writing steps write here: the author's
 * draft becomes the artifact, and VOICE writes the person's copy back exactly, with no model (ADR-0081; copy.ts says
 * how, per medium). A page's VOICE asks the browser (page-arbiter.ts): it offers only the lines Chromium shows, and a
 * write is stored only when Chromium shows the written page as the person's edit of the page before.
 */
import { routeChoice } from '@byway/catalog';
import type { Medium } from '@byway/contracts';
import { withoutMarks } from '@byway/gateway';
import { voiceWrite } from '@byway/recipe/semantics';
import { CheckpointResolvedError, CheckpointWithdrawnError } from '@byway/store';
import { applyClaims, claimLines } from '../claims.ts';
import {
  applyCopy,
  deckKindOf,
  extractCopy,
  mediaCopyOf,
  offeredPageCopy,
  offeredQuotes,
  pageEditProblems,
  pageVoiceSuffix,
  placePageEdit,
  readPageCopy,
  readPageEdit,
  roundTripProblem,
  sameCopy,
  samePageCopy,
  type MediaCopy,
  type PageEdit,
  type Refusal,
} from '../copy.ts';
import { parseArtifact, parseStoryboard } from '../formats.ts';
import { arbiterProblem, expectedShown, locate, markedCopy, notShown, notShownWhy, WHY_NOT_SHOWN, type Location, type NotShownWhy } from '../page-arbiter.ts';
import type { ArtifactResolver, PageRenderer, RenderOptions } from '../pages.ts';
import { INPUT_MEDIA_TYPE } from '../stored-inputs.ts';
import type { EarlierAnswer, FinishHumanInput, FinishHumanResult, OpenCheckpointInput, OpenCheckpointResult, RecordResolutionInput, RunRef, StepSpec } from '../types.ts';
import { PAGE_LINES_RULE } from '../workflow/wording.ts';
import type { RunnerDeps } from './deps.ts';
import { at, emit } from './events.ts';
import { AnswerRejected, StepError } from './failures.ts';
import { unreadableAnswer } from './held-voice.ts';
import { ArtifactReader } from './prompting.ts';
import { stepFinished, stepStarted } from './steps.ts';
import { runSeeds, storeText, writeProblems } from './writes.ts';

/** The claim log (ENG-2) reads claims out of Markdown, so it runs on prose; on any other medium the step writes the copy deck. */
const isClaimLog = (medium: Medium, step: Pick<StepSpec, 'variant'>): boolean => step.variant === 'claim-log' && medium === 'prose';

export async function openCheckpoint(deps: RunnerDeps, input: OpenCheckpointInput): Promise<OpenCheckpointResult> {
  const { run, call, checkpoint } = input;
  if (input.step) await stepStarted(deps, run, call, input.step, input.meta);
  // A page's VOICE: the page and the lines a browser shows, read once for the deck and the prompt.
  const page = await pageQuestion(deps, input);
  let initialText = checkpoint.initialText;
  let deckId: string | undefined;
  let earlier = '';
  if (input.initial) {
    // The demo's revision markers never reach a person (UX-6); the stored work keeps them for the demo's critic.
    const text = input.initial.artifactId ? withoutMarks(await deps.store.artifacts.getText(input.initial.artifactId)) : '';
    const from = input.initial.from === 'claims' && !isClaimLog(run.medium, input.step ?? {}) ? 'copy' : input.initial.from;
    switch (from) {
      case 'copy':
        try {
          initialText = page ? offeredPageCopy(page.html, page.notOffered) : extractCopy(run.medium, text, input.step ? mediaCopyOf(input.step) : undefined);
        } catch (e) {
          // No paid call is involved and a retry reads the same bytes: a plain, final failure.
          throw new StepError(`byway could not read the copy of this work (${(e as Error).message}).`);
        }
        break;
      case 'artifact':
        initialText = text;
        break;
      case 'claims':
        initialText = claimLines(text);
        break;
      case 'draft':
        // The draft the run was given travels as its file's id (P2), read here; without one the person starts blank.
        initialText = input.initial.draftId ? await new ArtifactReader(deps).startInput(input.initial.draftId, 'draft') : '';
        break;
    }
    if (input.initial.earlier && input.step && (from === 'copy' || from === 'claims') && initialText !== undefined) {
      ({ box: initialText, deckId, note: earlier } = await earlierLines(deps, { run, step: input.step, from, work: text, deck: initialText, earlier: input.initial.earlier }));
    }
  }
  const { prompt: asked, options } = plainChoice(run.recipeId, call.stepId, checkpoint);
  const prompt = withPageRules(page, asked, earlier);
  const stored = await deps.store.openCheckpoint({
    id: checkpoint.id,
    runId: run.runId,
    stepId: call.stepId,
    ...(call.candidate !== undefined ? { candidate: call.candidate } : {}),
    kind: checkpoint.kind,
    prompt,
    ...(options ? { options } : {}),
    ...(checkpoint.k !== undefined ? { k: checkpoint.k } : {}),
    ...(initialText !== undefined ? { initialText } : {}),
    ...(checkpoint.artifactIds?.length ? { artifactIds: checkpoint.artifactIds } : {}),
  });
  await emit(deps.store, run.runId, 'checkpoint-opened', { checkpointId: stored.id, kind: stored.kind }, at(call, `checkpoint/${stored.id}/opened`));
  return { checkpointId: stored.id, ...(stored.initialText !== undefined ? { initialText: stored.initialText } : {}), ...(deckId !== undefined ? { deckId } : {}) };
}

/**
 * Why a VOICE cannot read the work's lines it kept for itself (VOICE-RETRY): the deck its earlier answer was offered, or
 * the one an answer is measured against. Kept by this run, so a file that cannot be read now was lost since.
 */
const unreadableDeck = (id: string): string =>
  `The lines of the work this step offered cannot be read: their file (${id}) is missing or damaged in byway's data folder, perhaps from a partial restore (see "Back up and restore" in the README). Start the run again.`;

/**
 * VOICE-RETRY (D9; the P2 design, approved 2026-10-21): a VOICE the final check sent the run back over is asked again
 * with the person's last answer there and the deck it answered (OpenCheckpointInput.initial.earlier, by their files'
 * ids). The box starts from those lines where they still fit the work: on a deck of named fields (a storyboard's
 * on-screen copy, options) when they still read as an answer to the work's deck, as the total reader and the round trip
 * decide; on any other deck (prose, the voice-over script, a diff's "Why:", a claim log) only when the work's deck has
 * not changed. The work's deck is then kept as a text file and its id returned, so "unchanged" is measured against the
 * work's lines, not what the box started from, and sending the earlier lines back writes them (Claude's detail).
 * Otherwise the box starts from the work's lines, and the question says the earlier lines could not be kept and quotes
 * them. A page's question names them but never fills them in, since a page's lines are read again from the browser
 * (Claude's detail).
 *
 * An answer that changed nothing it was offered held none of the person's own lines, and one that equals the work's
 * lines needs no keeping: the box starts from the work's lines and the question says nothing (Claude's reading). A file
 * lost since fails the step plainly, as the held voice's do.
 */
async function earlierLines(
  deps: RunnerDeps,
  q: { run: RunRef; step: StepSpec; from: 'copy' | 'claims'; work: string; deck: string; earlier: EarlierAnswer },
): Promise<{ box: string; note: string; deckId?: string }> {
  const reader = new ArtifactReader(deps);
  const answer = await reader.ownText(q.earlier.answerId, unreadableAnswer(q.earlier.answerId));
  const answered = await reader.ownText(q.earlier.deckId, unreadableDeck(q.earlier.deckId));
  const asBefore = { box: q.deck, note: '' };
  const medium = q.run.medium;
  if (medium === 'web-page') return samePageCopy(answered, answer) || samePageCopy(q.deck, answer) ? asBefore : { box: q.deck, note: earlierNote(true, answered, answer) };
  const scope = mediaCopyOf(q.step);
  if (sameCopy(medium, scope, answered, answer) || sameCopy(medium, scope, q.deck, answer)) return asBefore;
  if (!fitsWork(medium, scope, q.from, q.work, q.deck, answered, answer)) return { box: q.deck, note: earlierNote(false, answered, answer) };
  return { box: answer, note: '', deckId: (await deps.store.artifacts.putText(q.deck, INPUT_MEDIA_TYPE)).id };
}

/** Whether an earlier VOICE answer still fits the work (earlierLines). Pure; a fault in the copy code is a no. */
function fitsWork(medium: Exclude<Medium, 'web-page'>, scope: MediaCopy, from: 'copy' | 'claims', work: string, deck: string, answered: string, answer: string): boolean {
  const kind = deckKindOf(medium, scope);
  if (from === 'claims' || (kind !== 'options' && kind !== 'on-screen')) return sameCopy(medium, scope, answered, deck);
  try {
    const applied = applyCopy(medium, work, answer, scope);
    return applied.ok && roundTripProblem(medium, scope, applied.value, answer) === undefined;
  } catch {
    return false;
  }
}

/** At most this many of the person's earlier lines are quoted when they could not be kept, each cut to 80 characters. */
const EARLIER_QUOTED = 5;

/**
 * What a VOICE asked again after a gate's retry says when its box does not start from the person's earlier lines: the
 * lines of their answer that were not lines of the deck it answered (what they wrote, not what they left as offered).
 */
function earlierNote(page: boolean, answered: string, answer: string): string {
  const offered = new Set(lfLines(answered).map((l) => l.trim()));
  const theirs = lfLines(answer)
    .map((l) => l.trim())
    .filter((l) => l && !offered.has(l));
  const cut = (s: string) => (s.length > 80 ? `${s.slice(0, 79)}…` : s);
  const more = theirs.length - EARLIER_QUOTED;
  const quoted = theirs.length ? `${theirs.slice(0, EARLIER_QUOTED).map((l) => `"${cut(l)}"`).join('; ')}${more > 0 ? `; and ${more} more` : ''}` : '';
  if (page) {
    const wrote = quoted ? `you had written: ${quoted}.` : 'you had changed lines here.';
    return ` Before the final check sent the work back, ${wrote} A page's lines are read again from the browser, so they are not filled in here: write them again where they still fit.`;
  }
  return ` Your lines from before the final check sent the work back could not be kept, because the work's lines have changed since.${quoted ? ` You had written: ${quoted}.` : ''} The box starts from the work's lines: write yours again where they still fit.`;
}

/** A page's VOICE question: the work (the checkpoint's artifact) and the lines it does not offer. */
interface PageQuestion {
  html: string;
  notOffered: Set<number>;
  /** The lines not offered (by number in the whole deck), each with why, in deck order. */
  whyNot: [number, NotShownWhy][];
  /** The browser could place the page's lines: else none of them can be changed. */
  checked: boolean;
}

/**
 * How long a page question's two browser reads may take in all. openCheckpoint runs under the workflow's `quick` proxy
 * (one minute to close, no heartbeat), so the reads (launching the browser included) share one deadline well inside it,
 * leaving the rest for the store: a page Chromium cannot read in time is a plain StepError, not a timed-out activity
 * Temporal retries.
 */
const QUESTION_READS_MS = 40_000;

/** The page renderer, which a page's VOICE needs: without it byway cannot check a write, so it never writes one. */
function pageRenderer(deps: RunnerDeps): PageRenderer {
  if (!deps.pages) throw new StepError('The words on a web page cannot be written in this step: no page renderer is configured, and byway writes a page only when a browser shows it as you wrote it.');
  return deps.pages;
}

/** Artifact routes in a page the browser reads, served from the store. */
const artifactRoute =
  (deps: RunnerDeps): ArtifactResolver =>
  async (id) => {
    if (!(await deps.store.artifacts.has(id))) return undefined;
    const { record, bytes } = await deps.store.artifacts.get(id);
    return { body: bytes, contentType: record.mediaType };
  };

/**
 * Where Chromium shows each of the page's lines (page-arbiter.ts). The reads fail as a render does, with a plain
 * StepError that is not retried (a page that never loads, a renderer that fails while reading); a fault in byway's own
 * code after them is `fault`'s error.
 */
async function pageLines(deps: RunnerDeps, html: string, fault: (e: Error) => Error, opts: RenderOptions = {}): Promise<Location> {
  const pages = pageRenderer(deps);
  const resolve = artifactRoute(deps);
  const plain = await pages.shownText(html, resolve, opts);
  let copy: string | undefined;
  try {
    copy = markedCopy(html);
  } catch (e) {
    throw fault(e as Error);
  }
  const marked = copy === undefined ? undefined : await pages.shownText(copy, resolve, opts);
  try {
    return locate(html, plain, marked);
  } catch (e) {
    throw fault(e as Error);
  }
}

/** A page's VOICE question, read once (see PageQuestion); undefined for any other question. */
async function pageQuestion(deps: RunnerDeps, input: OpenCheckpointInput): Promise<PageQuestion | undefined> {
  const { run, checkpoint } = input;
  if (run.medium !== 'web-page' || checkpoint.kind !== 'write' || input.step?.role !== 'voice') return undefined;
  const artifactId = checkpoint.artifactIds?.[0] ?? input.initial?.artifactId;
  if (!artifactId) return undefined;
  // The demo's revision markers never reach a person (UX-6).
  const html = withoutMarks(await deps.store.artifacts.getText(artifactId));
  // No paid call is involved and a retry reads the same bytes: a fault is a plain, final failure.
  const unreadable = (e: Error) => new StepError(`byway could not read the copy of this work (${e.message}).`);
  const loc = await pageLines(deps, html, unreadable, { deadline: Date.now() + QUESTION_READS_MS });
  try {
    return { html, notOffered: notShown(html, loc), whyNot: notShownWhy(html, loc), checked: loc.agrees };
  } catch (e) {
    throw unreadable(e as Error);
  }
}

/**
 * A page's VOICE question says how its copy is written (ADR-0081). The workflow's question ends with the line rule, the
 * one sentence that is the same for every page (PAGE_LINES_RULE, R-SUFFIX in the P2 design); what is read from the page
 * follows it here: the bracket rule when a line has link words in brackets, and where each link goes; which lines are
 * not offered, because a browser does not show them as one line, and why; and, when the browser could not place the
 * page's lines, that none of them can be changed. It is read from the work, never from the starting text, and appended
 * to the prompt the workflow sent, which never carries it, so a re-ask gets it once too.
 *
 * `earlier` is the note on the person's earlier lines (VOICE-RETRY), which belongs to the question: on a page it goes
 * before the line rule, so the question as shown is what it was when the activity wrote all of the page's rules.
 */
function withPageRules(page: PageQuestion | undefined, asked: string, earlier: string): string {
  if (!page) return `${asked}${earlier}`;
  const rules: string[] = [];
  try {
    const read = pageVoiceSuffix(readPageCopy(page.html, page.notOffered));
    if (read) rules.push(read);
    if (page.whyNot.length) rules.push(notOfferedSentence(page));
  } catch (e) {
    throw new StepError(`byway could not read the copy of this work (${(e as Error).message}).`);
  }
  if (!page.checked) rules.push("byway could not match this page's lines to what a browser shows, so none of them can be changed in this step.");
  const rule = ` ${PAGE_LINES_RULE}`;
  const question = earlier && asked.endsWith(rule) ? `${asked.slice(0, -rule.length)}${earlier}${rule}` : `${asked}${earlier}`;
  return [question, ...rules].join(' ');
}

/** At most this many lines not offered are quoted in the VOICE prompt, each cut to 60 characters. */
const NOT_OFFERED_MAX = 30;

/**
 * The lines a page's VOICE does not offer, named by why (page-arbiter.ts), in deck order within each reason: "These
 * lines of the page are not offered, …: hidden from sight (…): "Menu", "Close"; …".
 */
function notOfferedSentence(page: PageQuestion): string {
  const units = readPageCopy(page.html).units;
  const cut = (t: string) => (t.length > 60 ? `${t.slice(0, 57)}...` : t);
  const groups = new Map<NotShownWhy, string[]>();
  for (const [k, why] of page.whyNot.slice(0, NOT_OFFERED_MAX)) groups.set(why, [...(groups.get(why) ?? []), `"${cut(units[k]?.text ?? '')}"`]);
  const more = page.whyNot.length - NOT_OFFERED_MAX;
  const named = [...groups].map(([why, quotes]) => `${WHY_NOT_SHOWN[why]}: ${quotes.join(', ')}`).join('; ');
  return `These lines of the page are not offered, because a browser does not show them as one line here, and stay as they are: ${named}${more > 0 ? `; and ${more} more` : ''}.`;
}

/**
 * A route asked at run time in plain words (UX-3): the catalog's question for it and a "Name: detail" label per branch,
 * when it has them (protocol recipes). The option ids stay the branch names the workflow checks the answer against.
 */
function plainChoice(recipeId: string, routeId: string, cp: OpenCheckpointInput['checkpoint']): Pick<OpenCheckpointInput['checkpoint'], 'prompt' | 'options'> {
  const plain = cp.kind === 'choose' ? routeChoice(recipeId, routeId) : undefined;
  const options = cp.options;
  if (!plain || !options || !options.every((o) => plain.options.some((p) => p.id === o.id))) return { prompt: cp.prompt, ...(options ? { options } : {}) };
  return { prompt: plain.question, options: options.map((o) => ({ ...o, label: plain.options.find((p) => p.id === o.id)!.label })) };
}

/** Write the person's answer to the store (the workflow already validated it) and announce it. */
export async function recordResolution(deps: RunnerDeps, input: RecordResolutionInput): Promise<void> {
  try {
    await deps.store.resolveCheckpoint(input.resolution);
  } catch (e) {
    // A withdrawn question (its run was cancelled or failed) takes no answer, and retrying will not change that. It is
    // deliberately not a CheckpointResolvedError, so it never passes for an earlier attempt's success.
    if (e instanceof CheckpointWithdrawnError) throw new StepError('This question was withdrawn: its run was cancelled or failed.');
    // A retried activity whose first attempt committed finds the checkpoint already answered: that is success.
    if (!(e instanceof CheckpointResolvedError)) throw e;
  }
  await emit(deps.store, input.runId, 'checkpoint-resolved', { checkpointId: input.resolution.checkpointId }, at(input.call, `checkpoint/${input.resolution.checkpointId}/resolved`));
}

/** Turn a resolved human step into its outputs: texts back to the workflow, writes into the store. */
export async function finishHumanStep(deps: RunnerDeps, input: FinishHumanInput): Promise<FinishHumanResult> {
  const { run, call, step, resolution, ports } = input;
  const result: FinishHumanResult = { costUsd: 0 };
  const outputs: string[] = [];
  const text = resolution.text ?? '';
  if (input.kind === 'write') {
    // Text no store can hold (half of a surrogate pair) is asked about again, before anything is stored (ENG-6): a store
    // error would be retried, and fail the same way every time.
    const broken = lfLines(text).findIndex((l) => !l.isWellFormed());
    if (broken >= 0) {
      const kind = run.medium === 'web-page' ? 'web-page' : deckKindOf(run.medium, mediaCopyOf(step));
      const quotes = step.role === 'voice' ? offeredQuotes(kind, input.initialText, { lines: [broken + 1] }) : '';
      throw new AnswerRejected(`Line ${broken + 1} has a broken character (half of a surrogate pair, not valid Unicode), so it cannot be stored: type that character again, or take it out.${quotes}`);
    }
  }
  if (input.kind === 'write' && step.role === 'voice' && isClaimLog(run.medium, step) && step.produces.includes('artifact') && ports.artifact) {
    // The claim log (ENG-2): the owner's corrections replace the claims where they stood; nothing else changes.
    const before = await deps.store.artifacts.getText(ports.artifact);
    const applied = applyClaims(before, text);
    if (!applied.ok) throw new AnswerRejected(applied.problem);
    result.text = text;
    if (applied.value.changed.length) {
      const problems = writeProblems({ seeds: await runSeeds(deps.store, run.runId) }, applied.value.text);
      if (problems.length) throw new StepError(problems.join(' '));
      result.artifactId = await storeText(deps, run, call, applied.value.text, { label: 'With your corrections', name: 'work' });
      outputs.push(result.artifactId);
    }
  } else if (input.kind === 'write' && step.role === 'voice' && step.produces.includes('artifact') && ports.artifact) {
    const written = await writeVoice(deps, input, text);
    result.costUsd = written.costUsd;
    result.text = text;
    if (written.artifactId) {
      result.artifactId = written.artifactId;
      outputs.push(written.artifactId);
    }
  } else if (input.kind === 'write' && step.produces.includes('artifact')) {
    // The author's own draft (C3 "your own draft", C6/C6a every sentence): their text is the work. A draft byway cannot
    // read as the medium (bad JSON, a shot numbered twice, a diff without headers) is asked about again with why, before
    // anything is stored, as any other answer that cannot be written is (ENG-6); the workflow keeps their text.
    const parsed = run.medium === 'prose' ? { ok: true as const, value: `${text.trimEnd()}\n` } : parseArtifact(run.medium, text);
    if (!parsed.ok) throw new AnswerRejected(`Your draft could not be used as the ${run.medium}: ${parsed.problem}`);
    const problems = writeProblems({ seeds: await runSeeds(deps.store, run.runId) }, parsed.value);
    if (problems.length) throw new StepError(problems.join(' '));
    result.artifactId = await storeText(deps, run, call, parsed.value, { label: 'Your draft', name: 'work' });
    result.text = text;
    outputs.push(result.artifactId);
  } else if (input.kind === 'compare') {
    result.keep = resolution.choice?.[0] === 'A' ? 'A' : 'B';
  } else {
    result.text = text;
  }
  // A VOICE write's answer is the person's words from here on (ADR-0092), held by every keepsVoice write after it: kept
  // as a text file, an empty one included (an empty answer is an answer), and the workflow holds its id (P2). Beside it,
  // the deck it answered (the work's lines it was measured against), so that if a gate's retry runs this VOICE again,
  // its box can start from the answer where it still fits (VOICE-RETRY).
  if (input.kind === 'write' && voiceWrite(step)) {
    result.voiceId = (await deps.store.artifacts.putText(text, INPUT_MEDIA_TYPE)).id;
    const deckId = input.deckId ?? (input.initialText !== undefined ? (await deps.store.artifacts.putText(input.initialText, INPUT_MEDIA_TYPE)).id : undefined);
    if (deckId !== undefined) result.deckId = deckId;
  }
  await stepFinished(deps, run, call, { costUsd: result.costUsd, ...(outputs.length ? { outputArtifactIds: outputs } : {}) }, result.costUsd > 0);
  return result;
}

/** The late VOICE on a storyboard leaves the voice-over as it was locked (VOICE-1): a write that changed it is refused. */
function lockedVoiceover(medium: FinishHumanInput['run']['medium'], step: FinishHumanInput['step'], before: string, after: string): string[] {
  if (medium !== 'media' || mediaCopyOf(step) !== 'on-screen') return [];
  const was = parseStoryboard(before);
  const now = parseStoryboard(after);
  return was.ok && now.ok && was.value.voiceover !== now.value.voiceover ? ['The voice-over was locked after the script step: keep it exactly as it was.'] : [];
}

/** An answer's lines, any line ending. */
const lfLines = (t: string): string[] => t.replace(/\r\n?/g, '\n').split('\n');

/** The lines of an answer that differ from what was offered, by position (1-based): what a fault message quotes. */
const changedLines = (offered: string | undefined, answer: string): number[] => {
  if (offered === undefined) return [];
  const o = offered.replace(/\r\n?/g, '\n').split('\n');
  const a = answer.replace(/\r\n?/g, '\n').split('\n');
  return o.map((line, i) => (line.trimEnd() === (a[i] ?? '').trimEnd() ? 0 : i + 1)).filter((n) => n > 0);
};

/**
 * VOICE write-back, in this order (ADR-0081):
 * 1. An answer that differs from what was first offered only in layout writes nothing.
 * 2. Read and apply: the medium's total reader, then a deterministic write. No model.
 * 3. Check: the deck read back from the written artifact equals the answer (the round trip), the late VOICE left the
 *    voice-over alone, and no SEED string the run handed out got in (read from the store before the guard).
 * 4. A result equal to the work's bytes writes nothing; anything else is stored as "Your words", at no cost.
 * Steps 2 and 3 are pure and guarded: every problem, a fault in the runner's own copy code included, goes back to the
 * person as a question asked again (ENG-6), quoting how the lines it names were first offered. Store reads and writes
 * stay outside the guard, so a passing store error is retried as any activity error is.
 */
async function writeVoice(deps: RunnerDeps, input: FinishHumanInput, edited: string): Promise<{ costUsd: number; artifactId?: string }> {
  const { run, call, step, ports } = input;
  if (run.medium === 'web-page') return writePageVoice(deps, input, edited);
  const medium = run.medium;
  const scope = mediaCopyOf(step);
  const reader = new ArtifactReader(deps);
  // "Unchanged" is against the work's lines: what the box first offered, or, when it started from the person's earlier
  // lines (VOICE-RETRY), the work's deck it was handed by id.
  const unchanged = input.deckId !== undefined ? await reader.ownText(input.deckId, unreadableDeck(input.deckId)) : input.initialText;
  if (unchanged !== undefined && sameCopy(medium, scope, unchanged, edited)) return { costUsd: 0 };
  const before = await reader.text(ports.artifact!);
  const seeds = await runSeeds(deps.store, run.runId);
  let written: string;
  try {
    written = composeVoice(seeds, step, medium, scope, before, edited, input.initialText);
  } catch (e) {
    if (e instanceof AnswerRejected) throw e;
    const quotes = offeredQuotes(deckKindOf(medium, scope), input.initialText, { lines: changedLines(input.initialText, edited) });
    throw new AnswerRejected(`byway could not place this edit (${(e as Error).message}). Change those lines again, or leave them as they were offered.${quotes}`);
  }
  if (written === before) return { costUsd: 0 };
  return { costUsd: 0, artifactId: await storeText(deps, run, call, written, { label: 'Your words', name: 'work' }) };
}

/** Read, apply and check a non-web answer (pure). Throws AnswerRejected for every problem with the answer. */
function composeVoice(seeds: readonly string[], step: StepSpec, medium: Exclude<Medium, 'web-page'>, scope: MediaCopy, before: string, edited: string, offered: string | undefined): string {
  const refuse = (r: Refusal) => new AnswerRejected(`${r.problem}${offeredQuotes(deckKindOf(medium, scope), offered, r)}`);
  const applied = applyCopy(medium, before, edited, scope);
  if (!applied.ok) throw refuse(applied);
  const problems = [roundTripProblem(medium, scope, applied.value, edited), ...lockedVoiceover(medium, step, before, applied.value), ...writeProblems({ seeds }, applied.value)].filter((p): p is string => !!p);
  if (problems.length) throw refuse({ problem: problems.join(' ') });
  return applied.value;
}

/**
 * Pages (ADR-0081): the answer is read as an exact positional edit of the deck the question offered (the lines Chromium
 * shows), placed deterministically, and checked by the verifier against placement's witness and a fresh read of the
 * written page. No model. Then the browser has the last word: Chromium's reading of the written page must be the
 * person's edit of its reading of the page before (page-arbiter.ts), or the answer is asked again, naming the line.
 * Lines that were read differently since the question first opened are refused on that first offer and read against the
 * current deck on a re-ask; the answered checkpoint says which it is.
 */
async function writePageVoice(deps: RunnerDeps, input: FinishHumanInput, edited: string): Promise<{ costUsd: number; artifactId?: string }> {
  const { run, call, ports, resolution } = input;
  const offered = input.initialText;
  if (offered !== undefined && samePageCopy(offered, edited)) return { costUsd: 0 };
  const pages = pageRenderer(deps);
  const before = await new ArtifactReader(deps).text(ports.artifact!);
  const seeds = await runSeeds(deps.store, run.runId);
  // The first offer is the checkpoint whose starting text is what the step first offered; a re-ask starts from the
  // person's previous answer, which never equals it (an answer equal to the offer writes nothing above).
  const answered = await deps.store.getCheckpoint(resolution.checkpointId);
  const firstOffer = answered === undefined || answered.initialText === offered;
  const fault = (e: Error) => {
    const quotes = offeredQuotes('web-page', offered, { lines: changedLines(offered, edited) });
    return new AnswerRejected(`byway could not place this edit (${e.message}). Change those lines again, or leave them as they were offered.${quotes}`);
  };
  const loc = await pageLines(deps, before, fault);
  let written: string;
  let edit: PageEdit;
  let notOffered: Set<number>;
  try {
    notOffered = notShown(before, loc);
    ({ page: written, edit } = composePage(seeds, before, edited, offered, firstOffer, notOffered));
  } catch (e) {
    if (e instanceof AnswerRejected) throw e;
    throw fault(e as Error);
  }
  if (written === before) return { costUsd: 0 };
  // The browser's word: what Chromium shows of the written page against the person's edit of what it showed before.
  let expected: ReturnType<typeof expectedShown>;
  try {
    expected = expectedShown(before, loc, notOffered, edit);
  } catch (e) {
    throw fault(e as Error);
  }
  if ('problem' in expected) throw pageRefusal(offered, expected.problem, [expected.line]);
  const after = await pages.shownText(written, artifactRoute(deps));
  let verdict: ReturnType<typeof arbiterProblem>;
  try {
    verdict = arbiterProblem(expected, after);
  } catch (e) {
    throw fault(e as Error);
  }
  if (verdict) throw pageRefusal(offered, verdict.problem, [verdict.line]);
  return { costUsd: 0, artifactId: await storeText(deps, run, call, written, { label: 'Your words', name: 'work' }) };
}

/** A refused page answer, quoting how the lines it names were first offered. */
function pageRefusal(offered: string | undefined, problem: string, lines: number[] = []): AnswerRejected {
  const named = new Set([...lines, ...[...problem.matchAll(/\bLine (\d+)\b/g)].map((m) => Number(m[1]))]);
  return new AnswerRejected(`${problem}${offeredQuotes('web-page', offered, { lines: [...named] })}`);
}

/** Read, place and verify a page answer (pure). Throws AnswerRejected for every problem with it. */
function composePage(seeds: readonly string[], before: string, edited: string, offered: string | undefined, firstOffer: boolean, notOffered: ReadonlySet<number>): { page: string; edit: PageEdit } {
  const refuse = (problem: string, lines: number[] = []) => pageRefusal(offered, problem, lines);
  const edit = readPageEdit(readPageCopy(before, notOffered), edited, offered, firstOffer);
  if (!edit.ok) throw refuse(edit.problem, edit.lines);
  const placed = placePageEdit(before, edit, notOffered);
  if (placed.problems.length) throw refuse(placed.problems.join(' '));
  const problems = [...pageEditProblems(before, placed.page, edit, placed, notOffered), ...writeProblems({ seeds }, placed.page)];
  if (problems.length) throw refuse(problems.join(' '));
  return { page: placed.page, edit };
}
