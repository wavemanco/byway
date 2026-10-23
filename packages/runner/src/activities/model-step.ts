/**
 * The `modelStep` activity (spec §3.2): render the step's prompt with its slots, call the gateway at the step's tier
 * with the purpose `<role>:<medium>`, and parse the answer by role (spec §3.3). Builders' artifacts are checked (PR3,
 * keepsVoice) and stored; judging answers come back as short texts, scores and labels for the workflow to act on.
 */
import { randomBytes } from 'node:crypto';
import type { Tier } from '@byway/contracts';
import { GREAT_MIN_REFERENCES, labelled } from '@byway/prompts/pure';
import { fences, parseArtifact, textView, type Parsed } from '../formats.ts';
import { labels } from '../labels.ts';
import { rendersKnob } from '../surfaces.ts';
import { parseCheck, parseChoice, parseCritic, parseCut, parseDedupe, parseKeep, parseOverlap, parseTellsSweep, parseVision, type CriticAnswer } from '../parse.ts';
import { tellsText } from '../tells.ts';
import type { ModelStepInput, ModelStepResult, TellsHit } from '../types.ts';
import { otherFamilyModel, OTHER_FAMILY_FALLBACK_NOTE } from './availability.ts';
import { askModel } from './call.ts';
import { memoized, newSalt, seededRandom } from './memo.ts';
import { buildLineup, lineupWrittenFor, planCritic, verdictOf, type Lineup } from './critic.ts';
import type { RunnerDeps } from './deps.ts';
import { StepError } from './failures.ts';
import { ArtifactReader, buildPrompt } from './prompting.ts';
import { labelFor, stepFinished, stepStarted } from './steps.ts';
import { keptVoice } from './held-voice.ts';
import { checkedWriter, restoredNote, runSeeds, seedMemoKey, storeText, type CheckedWrite } from './writes.ts';

const BUILDERS = new Set(['build', 'seed', 'fix', 'voice']);
/** Judging answers are short; builders get the gateway's larger default. */
const JUDGE_MAX_OUTPUT = 4_000;

/** 01 SEED seed_shape ⟨A⟩: 32–64 characters; 36 random bytes are 48 base64url characters (SEED-1). */
export const defaultSeed = (): string => randomBytes(36).toString('base64url');

/**
 * Where a judging step's text goes in the store: shown to the user with the step, never written into the work. Every
 * answer of these roles leaves a note, which the interpreter puts beside the work; a seed's build leaves one only when
 * it writes a direction (`directionOf`). So @byway/recipe's `leavesNote` is 'always' for these roles, and for a seed
 * 'always' where its prompt asks for the direction first (C1's) and 'sometimes' where it asks for the block alone
 * (semantics-effects.test.ts).
 */
export const NOTE_LABELS: Record<string, string> = {
  critic: 'Critique',
  check: 'Defects',
  cut: 'Removals',
  'tells-sweep': 'Cliché hits',
  overlap: 'Overlap flags',
  vision: 'Direction',
};

export async function modelStep(deps: RunnerDeps, input: ModelStepInput): Promise<ModelStepResult> {
  const { run, call, step } = input;
  const reader = new ArtifactReader(deps);
  await stepStarted(deps, run, call, step, input.meta);
  const what = input.meta?.label ?? labelFor(deps, run.recipeId, step);
  const tier: Tier = step.tier ?? (step.role === 'critic' || step.role === 'judge' ? 'big' : 'mid');
  const purpose = `${step.role}:${run.medium}`;
  if (!step.prompt) throw new StepError(`The ${what} step names no prompt.`);
  const promptId = step.prompt;
  // The run's own tell catalog travels as its file's id (P2): read here, for the steps that take it.
  const tells = step.consumes.includes('tells') ? tellsText(deps.prompts, run.medium, step, input.tellsId ? await reader.startInput(input.tellsId, 'tell catalog') : undefined) : undefined;
  await rendererReady(deps, reader, input.refs);

  const result: ModelStepResult = { costUsd: 0 };
  const outputs: string[] = [];

  if (step.role === 'critic') {
    // The lineup's draws replay on a retry (convention C5), so a shuffle already paid for is the same request again.
    const random = deps.random ?? seededRandom(await memoized(deps.store, run.runId, `${call.key}/random`, newSalt));
    const plan = planCritic(step, input.refs, random);
    // A critic of another AI family (01 CRITIC knob, FID-1): the profile's other-family model when its key is set up,
    // else a fresh session of the same family (every critic call is one), and the step says which.
    const otherFamily = step.knobs?.family === 'other';
    const reviewer = otherFamily ? otherFamilyModel(deps, run) : undefined;
    const notes = [plan.note, otherFamily && !reviewer ? OTHER_FAMILY_FALLBACK_NOTE : undefined].filter(Boolean);
    const answers: { answer: CriticAnswer; lineup?: Lineup }[] = [];
    for (let i = 0; i < plan.shuffles; i++) {
      const built = await buildPrompt(reader, { medium: run.medium, problemId: run.problemId, step, ports: input.ports, ...(input.round !== undefined ? { round: input.round } : {}) });
      const lineup = plan.mode === 'GREAT' ? await buildLineup(deps, reader, run.medium, input.ports, plan.refs, random, plan.shuffle, rendersKnob(step.knobs), run.runId) : undefined;
      if (lineup) {
        Object.assign(built.slots, lineup.slots);
        built.images = lineup.images;
      }
      // A GREAT answer must rank every label of this lineup exactly once; anything else is a miss, asked once more.
      const answer = await askModel(deps, reader, {
        run,
        call,
        promptId,
        slots: built.slots,
        images: built.images,
        purpose,
        tier,
        ...(reviewer ? { model: reviewer } : {}),
        what,
        maxOutputTokens: JUDGE_MAX_OUTPUT,
        parse: (text) => parseCritic(text, lineup?.labels),
      });
      result.costUsd += answer.costUsd;
      answers.push({ answer: answer.value, ...(lineup ? { lineup } : {}) });
    }
    const verdict = verdictOf(answers, lineupWrittenFor(step));
    // A card that cut words says whose and how many in the step's note (F13, ADR-0087).
    if (verdict.note) notes.push(verdict.note);
    result.text = verdict.critique;
    result.score = verdict.score;
    result.criticMode = plan.mode;
    if (notes.length) result.note = notes.join(' ');
  } else {
    // One string per step call, kept for its retries (convention C5): the same prompt, so the answer bought is reused.
    // It is kept in the run's seed range, where every write check of the run reads it (writes.ts runSeeds).
    const seed = step.role === 'seed' || step.consumes.includes('seed') ? await memoized(deps.store, run.runId, seedMemoKey(call), deps.seed ?? defaultSeed) : undefined;
    const ports = input.candidates ? { ...input.ports, options: input.candidates } : input.ports;
    const built = await buildPrompt(reader, {
      medium: run.medium,
      problemId: run.problemId,
      step,
      ports,
      ...(input.round !== undefined ? { round: input.round } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(tells !== undefined ? { tells } : {}),
    });
    if (step.role === 'tells-compare') Object.assign(built.slots, await compareSlots(reader, run.medium, ports));
    if ((step.role === 'judge' || step.role === 'select') && !step.consumes.includes('option_set<artifact>')) {
      built.slots.options = labelled(await Promise.all((ports.options ?? []).map((id) => reader.candidateText(run.medium, id))));
    }
    // PR3: every seed the run has handed out, this step's own included, read from the store (P2).
    const seeds = await runSeeds(deps.store, run.runId);
    // keepsVoice: the person's deck is locked before the call (an empty voice is a voice too), and held after it.
    const voice = step.keepsVoice ? await keptVoice(reader, input.ports) : undefined;
    const before = voice !== undefined && input.ports.artifact ? await reader.text(input.ports.artifact) : undefined;
    const parse = parserFor(step.role, run.medium, ports, checkedWriter({ seeds, medium: run.medium }, voice, before));
    const answer = await askModel(deps, reader, {
      run,
      call,
      promptId,
      slots: built.slots,
      images: built.images,
      purpose,
      tier,
      what,
      ...(BUILDERS.has(step.role) ? {} : { maxOutputTokens: JUDGE_MAX_OUTPUT }),
      parse,
    });
    result.costUsd = answer.costUsd;
    const v = answer.value;
    switch (v.kind) {
      case 'artifact': {
        result.artifactId = await storeText(deps, run, call, v.text, { label: what, name: 'work' });
        const kept = restoredNote(v.restored);
        if (kept) result.note = result.note ? `${result.note} ${kept}` : kept;
        outputs.push(result.artifactId);
        if (v.direction) {
          // 01 SEED step 7 ⟨A⟩: seed → direction → artifact, logged outside the artifact. Never the string itself (PR3).
          const direction = seeds.reduce((d, s) => (s ? d.split(s).join('(the random string)') : d), v.direction);
          result.noteArtifactId = await storeText(deps, run, call, `${direction}\n`, { label: `${what}: Direction`, name: 'note', mediaType: 'text/markdown' });
          outputs.push(result.noteArtifactId);
        }
        break;
      }
      case 'text':
        result.text = v.text;
        if (v.clean !== undefined) result.clean = v.clean;
        if (v.empty) result.nothingToRemove = true;
        if (v.hits) result.hits = v.hits;
        break;
      case 'label':
        result.label = v.label;
        break;
      case 'keep':
        result.keep = v.keep;
        break;
      case 'dedupe':
        result.keepLabels = v.keep;
        break;
    }
  }

  if (result.text !== undefined && NOTE_LABELS[step.role]) {
    result.noteArtifactId = await storeText(deps, run, call, `${result.text}\n`, { label: `${what}: ${NOTE_LABELS[step.role]}`, name: 'note', mediaType: 'text/markdown' });
    outputs.push(result.noteArtifactId);
  }
  await stepFinished(deps, run, call, { costUsd: result.costUsd, ...(result.note ? { note: result.note } : {}), ...(outputs.length ? { outputArtifactIds: outputs } : {}) }, true);
  return result;
}

/**
 * Readiness before spend for runs of any medium (ADR-0084). A GREAT lineup with an image among at least three references
 * mixes forms, so its critic sees cards, which only the page renderer draws (BLIND-1). Such a run's references are
 * workflow input, which beginRun cannot see, so every model step asks the renderer before its first provider call:
 * a run whose renderer cannot start stops, with the renderer's plain message, before anything is spent. Asking again
 * finds the shared browser running. A web page's run is asked when it begins (beginRun) and is asked here too.
 */
async function rendererReady(deps: RunnerDeps, reader: ArtifactReader, refs: readonly string[]): Promise<void> {
  if (!deps.pages || refs.length < GREAT_MIN_REFERENCES) return;
  for (const ref of refs) {
    if (await reader.isImage(ref)) {
      await deps.pages.ready();
      return;
    }
  }
}

/**
 * What a SEED build wrote before its block: the direction, one line per axis (the C1 SEED template asks for it). A
 * single line ("Here is the page.") is not one, so it needs at least two lines.
 */
export function directionOf(answer: string): string | undefined {
  const first = fences(answer)[0];
  if (!first) return undefined;
  const before = answer.slice(0, first.start).trim();
  return before.split('\n').filter((l) => l.trim()).length >= 2 ? before : undefined;
}

/** A model keep-or-revert sees the version before the sweep (A) and after it (B). */
async function compareSlots(reader: ArtifactReader, medium: Parameters<typeof textView>[0], ports: ModelStepInput['ports']) {
  if (!ports.previousArtifact || !ports.artifact) return {};
  const [a, b] = await Promise.all([reader.text(ports.previousArtifact), reader.text(ports.artifact)]);
  return { view: labelled([textView(medium, a), textView(medium, b)]) };
}

type Answer =
  /**
   * `direction`: what a SEED build wrote before its block (SEED-1), kept as a note beside the work. `restored`: the
   * person's fields this answer changed and the runner wrote back (keepsVoice), for the step's note.
   */
  | { kind: 'artifact'; text: string; restored: string[]; direction?: string }
  /** `empty`: a CUT answered "Nothing to remove." (its text says so, for the note beside the work). */
  | { kind: 'text'; text: string; clean?: boolean; empty?: boolean; hits?: TellsHit[] }
  | { kind: 'label'; label: string }
  | { kind: 'keep'; keep: 'A' | 'B' }
  | { kind: 'dedupe'; keep: string[] };

/**
 * How a model step's answer is read, by role. Exported so @byway/recipe's effects table (ADR-0092) is held to it: a role
 * this switch does not name is parsed as the work, and the table fails closed the same way. `write` checks a written
 * work and returns what to store (keepsVoice may write the person's words back, ADR-0081).
 */
export function parserFor(role: string, medium: ModelStepInput['run']['medium'], ports: ModelStepInput['ports'], write: (text: string) => CheckedWrite): (text: string) => Parsed<Answer> {
  const map = <T>(r: Parsed<T>, f: (v: T) => Answer): Parsed<Answer> => (r.ok ? { ok: true, value: f(r.value) } : r);
  const candidates = labels(ports.options?.length ?? 0);
  switch (role) {
    case 'check':
      return (t) => map(parseCheck(t), (v) => ({ kind: 'text', text: v.defects, clean: v.clean }));
    case 'cut':
      return (t) => map(parseCut(t), (v) => (v ? { kind: 'text', text: v } : { kind: 'text', text: 'Nothing to remove.', empty: true }));
    case 'tells-sweep':
      return (t) => map(parseTellsSweep(t), (v) => ({ kind: 'text', text: v.critique, hits: v.hits }));
    case 'tells-compare':
      return (t) => map(parseKeep(t), (keep) => ({ kind: 'keep', keep }));
    case 'vision':
      return (t) => map(parseVision(t), (v) => ({ kind: 'text', text: v }));
    case 'judge':
    case 'select':
      return (t) => map(parseChoice(t, candidates), (label) => ({ kind: 'label', label }));
    case 'dedupe':
      return (t) => map(parseDedupe(t, candidates), (v) => ({ kind: 'dedupe', keep: v.keep }));
    case 'overlap': {
      const seeded = labels(ports.view?.items.length ?? 0);
      const vanilla = (ports.options ?? []).map((_, i) => `V${i + 1}`);
      return (t) => map(parseOverlap(t, seeded, vanilla), (v) => ({ kind: 'text', text: v }));
    }
    default:
      // build, seed, fix and any other writer: the artifact in the medium's format, then the write checks.
      return (t) => {
        const r = parseArtifact(medium, t);
        if (!r.ok) return r;
        const checked = write(r.value);
        if (checked.problems.length) return { ok: false, problem: checked.problems.join(' ') };
        const direction = role === 'seed' ? directionOf(t) : undefined;
        return { ok: true, value: { kind: 'artifact', text: checked.text, restored: checked.restored, ...(direction ? { direction } : {}) } };
      };
  }
}
