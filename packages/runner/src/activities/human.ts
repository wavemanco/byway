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
import { arbiterProblem, expectedShown, locate, markedCopy, notShown, type Location } from '../page-arbiter.ts';
import type { ArtifactResolver, PageRenderer, RenderOptions } from '../pages.ts';
import type { FinishHumanInput, FinishHumanResult, OpenCheckpointInput, OpenCheckpointResult, RecordResolutionInput, StepSpec } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { at, emit } from './events.ts';
import { AnswerRejected, StepError } from './failures.ts';
import { ArtifactReader } from './prompting.ts';
import { stepFinished, stepStarted } from './steps.ts';
import { storeText, writeProblems } from './writes.ts';

/** The claim log (ENG-2) reads claims out of Markdown, so it runs on prose; on any other medium the step writes the copy deck. */
const isClaimLog = (medium: Medium, step: Pick<StepSpec, 'variant'>): boolean => step.variant === 'claim-log' && medium === 'prose';

export async function openCheckpoint(deps: RunnerDeps, input: OpenCheckpointInput): Promise<OpenCheckpointResult> {
  const { run, call, checkpoint } = input;
  if (input.step) await stepStarted(deps, run, call, input.step, input.meta);
  // A page's VOICE: the page and the lines a browser shows, read once for the deck and the prompt.
  const page = await pageQuestion(deps, input);
  let initialText = checkpoint.initialText;
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
        initialText = input.initial.draft ?? '';
        break;
    }
  }
  const { prompt: asked, options } = plainChoice(run.recipeId, call.stepId, checkpoint);
  const prompt = withPageRules(page, asked);
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
  return { checkpointId: stored.id, ...(stored.initialText !== undefined ? { initialText: stored.initialText } : {}) };
}

/** A page's VOICE question: the work (the checkpoint's artifact) and the lines it does not offer. */
interface PageQuestion {
  html: string;
  notOffered: Set<number>;
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
 * Where Chromium shows each of the page's lines (page-arbiter.ts). The reads may fail as a render does (a plain error is
 * retried; a page that never loads is a StepError); a fault in byway's own code after them is `fault`'s error.
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
    return { html, notOffered: notShown(html, loc), checked: loc.agrees };
  } catch (e) {
    throw unreadable(e as Error);
  }
}

/**
 * A page's VOICE question says how its copy is written (ADR-0081): one line per run of text, the bracket rule when a line
 * has link words in brackets, and where each link goes; that text a browser does not show as one line is not offered;
 * and, when the browser could not place the page's lines, that none of them can be changed. It is read from the work, never from the
 * starting text, and appended to the prompt the workflow sent, which never carries it, so a re-ask gets it once too.
 */
function withPageRules(page: PageQuestion | undefined, prompt: string): string {
  if (!page) return prompt;
  let rules: string;
  try {
    rules = pageVoiceSuffix(readPageCopy(page.html, page.notOffered));
  } catch (e) {
    throw new StepError(`byway could not read the copy of this work (${(e as Error).message}).`);
  }
  if (page.notOffered.size) rules += ' Text a browser does not show as one line here (hidden, out of sight, a tooltip, or laid out differently) is not offered, and stays as it is.';
  if (!page.checked) rules += " byway could not match this page's lines to what a browser shows, so none of them can be changed in this step.";
  return `${prompt} ${rules}`;
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
      const problems = writeProblems(run, applied.value.text);
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
    // The author's own draft (C3 "your own draft", C6/C6a every sentence): their text is the work.
    const parsed = run.medium === 'prose' ? { ok: true as const, value: `${text.trimEnd()}\n` } : parseArtifact(run.medium, text);
    if (!parsed.ok) throw new StepError(`Your draft could not be used as the ${run.medium}: ${parsed.problem}`);
    const problems = writeProblems(run, parsed.value);
    if (problems.length) throw new StepError(problems.join(' '));
    result.artifactId = await storeText(deps, run, call, parsed.value, { label: 'Your draft', name: 'work' });
    result.text = text;
    outputs.push(result.artifactId);
  } else if (input.kind === 'compare') {
    result.keep = resolution.choice?.[0] === 'A' ? 'A' : 'B';
  } else {
    result.text = text;
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
 *    voice-over alone, and no SEED string got in.
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
  if (input.initialText !== undefined && sameCopy(medium, scope, input.initialText, edited)) return { costUsd: 0 };
  const before = await new ArtifactReader(deps).text(ports.artifact!);
  let written: string;
  try {
    written = composeVoice(run, step, medium, scope, before, edited, input.initialText);
  } catch (e) {
    if (e instanceof AnswerRejected) throw e;
    const quotes = offeredQuotes(deckKindOf(medium, scope), input.initialText, { lines: changedLines(input.initialText, edited) });
    throw new AnswerRejected(`byway could not place this edit (${(e as Error).message}). Change those lines again, or leave them as they were offered.${quotes}`);
  }
  if (written === before) return { costUsd: 0 };
  return { costUsd: 0, artifactId: await storeText(deps, run, call, written, { label: 'Your words', name: 'work' }) };
}

/** Read, apply and check a non-web answer (pure). Throws AnswerRejected for every problem with the answer. */
function composeVoice(run: FinishHumanInput['run'], step: StepSpec, medium: Exclude<Medium, 'web-page'>, scope: MediaCopy, before: string, edited: string, offered: string | undefined): string {
  const refuse = (r: Refusal) => new AnswerRejected(`${r.problem}${offeredQuotes(deckKindOf(medium, scope), offered, r)}`);
  const applied = applyCopy(medium, before, edited, scope);
  if (!applied.ok) throw refuse(applied);
  const problems = [roundTripProblem(medium, scope, applied.value, edited), ...lockedVoiceover(medium, step, before, applied.value), ...writeProblems(run, applied.value)].filter((p): p is string => !!p);
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
    ({ page: written, edit } = composePage(run, before, edited, offered, firstOffer, notOffered));
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
function composePage(run: FinishHumanInput['run'], before: string, edited: string, offered: string | undefined, firstOffer: boolean, notOffered: ReadonlySet<number>): { page: string; edit: PageEdit } {
  const refuse = (problem: string, lines: number[] = []) => pageRefusal(offered, problem, lines);
  const edit = readPageEdit(readPageCopy(before, notOffered), edited, offered, firstOffer);
  if (!edit.ok) throw refuse(edit.problem, edit.lines);
  const placed = placePageEdit(before, edit, notOffered);
  if (placed.problems.length) throw refuse(placed.problems.join(' '));
  const problems = [...pageEditProblems(before, placed.page, edit, placed, notOffered), ...writeProblems(run, placed.page)];
  if (problems.length) throw refuse(problems.join(' '));
  return { page: placed.page, edit };
}
