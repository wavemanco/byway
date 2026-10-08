/**
 * The `modelStep` activity (spec §3.2): render the step's prompt with its slots, call the gateway at the step's tier
 * with the purpose `<role>:<medium>`, and parse the answer by role (spec §3.3). Builders' artifacts are checked (PR3,
 * keepsVoice) and stored; judging answers come back as short texts, scores and labels for the workflow to act on.
 */
import { randomBytes, randomInt } from 'node:crypto';
import type { Tier } from '@byway/contracts';
import { parseArtifact, textView, type Parsed } from '../formats.ts';
import { labelled, labels } from '../labels.ts';
import { parseCheck, parseChoice, parseCritic, parseCut, parseDedupe, parseKeep, parseOverlap, parseTellsSweep, parseVision, type CriticAnswer } from '../parse.ts';
import type { ModelStepInput, ModelStepResult, Score } from '../types.ts';
import { askModel } from './call.ts';
import { greatLineup, planCritic } from './critic.ts';
import type { RunnerDeps } from './deps.ts';
import { StepError } from './failures.ts';
import { ArtifactReader, buildPrompt } from './prompting.ts';
import { labelFor, stepFinished, stepStarted } from './steps.ts';
import { storeText, writeProblems } from './writes.ts';

const BUILDERS = new Set(['build', 'seed', 'fix', 'voice']);
/** Judging answers are short; builders get the gateway's larger default. */
const JUDGE_MAX_OUTPUT = 4_000;

export const defaultSeed = (): string => randomBytes(12).toString('base64url');
export const defaultRandom = (): number => randomInt(0, 2 ** 31) / 2 ** 31;

/** Where a judging step's text goes in the store: shown to the user with the step, never written into the work. */
const NOTE_LABELS: Record<string, string> = {
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
  const tells = step.consumes.includes('tells') ? tellsText(deps, run.medium, input.tells) : undefined;

  const result: ModelStepResult = { costUsd: 0 };
  const outputs: string[] = [];

  if (step.role === 'critic') {
    const random = deps.random ?? defaultRandom;
    const plan = planCritic(step, input.refs, random);
    const answers: CriticAnswer[] = [];
    for (let i = 0; i < plan.shuffles; i++) {
      const built = await buildPrompt(reader, { medium: run.medium, problem: run.problem, step, ports: input.ports, ...(input.round !== undefined ? { round: input.round } : {}) });
      let lineup: number | undefined;
      if (plan.mode === 'GREAT') {
        const l = await greatLineup(deps, reader, run.medium, input.ports, plan.refs, random, plan.shuffle);
        lineup = l.size;
        Object.assign(built.slots, l.slots);
        built.images = l.images;
      }
      const answer = await askModel(deps, reader, {
        run,
        call,
        promptId,
        slots: built.slots,
        images: built.images,
        purpose,
        tier,
        what,
        maxOutputTokens: JUDGE_MAX_OUTPUT,
        parse: (text) => parseCritic(text, plan.mode, lineup),
      });
      result.costUsd += answer.costUsd;
      answers.push(answer.value);
    }
    result.text = answers[0]!.critique;
    result.score = averaged(answers.map((a) => a.score));
    result.criticMode = plan.mode;
    if (plan.note) result.note = plan.note;
  } else {
    const seed = step.role === 'seed' || step.consumes.includes('seed') ? (deps.seed ?? defaultSeed)() : undefined;
    const ports = input.candidates ? { ...input.ports, options: input.candidates } : input.ports;
    const built = await buildPrompt(reader, {
      medium: run.medium,
      problem: run.problem,
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
    const seeds = seed ? [...run.seeds, seed] : run.seeds;
    const voice = step.keepsVoice ? input.ports.voice : undefined;
    const before = voice && input.ports.artifact ? await reader.text(input.ports.artifact) : undefined;
    const parse = parserFor(step.role, run.medium, ports, (text) => writeProblems({ seeds, medium: run.medium }, text, voice, before));
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
    if (seed) result.seed = seed;
    const v = answer.value;
    switch (v.kind) {
      case 'artifact':
        result.artifactId = await storeText(deps, run, call, v.text, { label: what, name: 'work' });
        outputs.push(result.artifactId);
        break;
      case 'text':
        result.text = v.text;
        if (v.clean !== undefined) result.clean = v.clean;
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

/** GREAT answers over several fixed shuffles are averaged by rank (03 C5 gate). */
function averaged(scores: Score[]): Score {
  const first = scores[0]!;
  if (scores.length === 1 || first.kind === 'score') return first;
  const ranks = scores.map((s) => (s.kind === 'rank' ? s.rank : 0));
  return { kind: 'rank', rank: ranks.reduce((a, b) => a + b, 0) / ranks.length, of: first.of };
}

/** The tell catalog for the medium (spec §3.1 `tells`), unless the run brought its own. */
function tellsText(deps: RunnerDeps, medium: string, own: string | undefined): string {
  if (own?.trim()) return own;
  const id = `tells.${medium}`;
  return deps.prompts.has(id) ? deps.prompts.render(id, { medium: medium as never }).user : '';
}

/** A model keep-or-revert sees the version before the sweep (A) and after it (B). */
async function compareSlots(reader: ArtifactReader, medium: Parameters<typeof textView>[0], ports: ModelStepInput['ports']) {
  if (!ports.previousArtifact || !ports.artifact) return {};
  const [a, b] = await Promise.all([reader.text(ports.previousArtifact), reader.text(ports.artifact)]);
  return { view: labelled([textView(medium, a), textView(medium, b)]) };
}

type Answer =
  | { kind: 'artifact'; text: string }
  | { kind: 'text'; text: string; clean?: boolean }
  | { kind: 'label'; label: string }
  | { kind: 'keep'; keep: 'A' | 'B' }
  | { kind: 'dedupe'; keep: string[] };

function parserFor(role: string, medium: ModelStepInput['run']['medium'], ports: ModelStepInput['ports'], checks: (text: string) => string[]): (text: string) => Parsed<Answer> {
  const map = <T>(r: Parsed<T>, f: (v: T) => Answer): Parsed<Answer> => (r.ok ? { ok: true, value: f(r.value) } : r);
  const candidates = labels(ports.options?.length ?? 0);
  switch (role) {
    case 'check':
      return (t) => map(parseCheck(t), (v) => ({ kind: 'text', text: v.defects, clean: v.clean }));
    case 'cut':
      return (t) => map(parseCut(t), (v) => ({ kind: 'text', text: v }));
    case 'tells-sweep':
      return (t) => map(parseTellsSweep(t), (v) => ({ kind: 'text', text: v.critique }));
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
        const problems = checks(r.value);
        return problems.length ? { ok: false, problem: problems.join(' ') } : { ok: true, value: { kind: 'artifact', text: r.value } };
      };
  }
}
