/**
 * The recipe interpreter (spec §3): it walks the recipe tree (`byway.recipe/1`) operator by operator, holding port
 * values by reference, and hands every bit of I/O to activities. Workflow code: deterministic (Temporal's seeded
 * Math.random, no clocks, no Node), and it imports only pure modules.
 *
 * Operators (spec §3.2):
 * - seq runs in order; replicate and each run their candidates concurrently, recording the candidate index;
 * - pick asks a person (H), a judge step (C) or chance (R);
 * - loop applies its hidden threshold outside every prompt, with probe, plateau, cap and best-snapshot rules;
 * - route takes the run's up-front choice or asks; optional asks with its trigger;
 * - audit runs its lenses concurrently and keeps their notes beside the work, never in it;
 * - a one-shot gate re-runs a stage on a fail, then asks; relay runs one link per storyboard shot, in order.
 */
import { ActivityFailure, ApplicationFailure, condition, isCancellation } from '@temporalio/workflow';
import type { CheckpointResolution } from '@byway/contracts';
import { labelOf } from '@byway/prompts/pure';
import type { Audit, Each, Loop, Node, OneShotGate, Optional, Pick as PickNode, RelayChain, Replicate, Route, Step } from '@byway/recipe';
import { bestSnapshots, converging, passes, plateaued, raiseAmount } from '../gates.ts';
import { indexOfLabel } from '../labels.ts';
import { FAILURE, toStepSpec, type BudgetFailureDetails, type RejectedAnswerDetails, type CheckpointSpec, type ModelStepResult, type OpenCheckpointInput, type Ports, type RunInput, type RunRef, type Score, type StageName, type StepCall, type ViewRef, type WorkflowEvent } from '../types.ts';
import { media, model, quick } from './acts.ts';
import type { PendingCheckpoint, RunControl } from './control.ts';
import {
  BEST_SO_FAR_PROMPT,
  budgetPrompt,
  DECLINED_NOTE,
  GATE_FAILED_PROMPT,
  GATE_RETRY_NOTE,
  humanKind,
  humanPrompt,
  NOT_CONVERGING_PROMPT,
  NOTHING_TO_REMOVE,
  optionalPrompt,
  READY_PROMPT,
  routePrompt,
} from './wording.ts';

/** A plain failure that ends the run with this message. */
export class RunFailure extends Error {
  override name = 'RunFailure';
}

/** A one-shot gate failed with retries left: re-enter `stage` from its own entry state. */
class RetryStage extends Error {
  override name = 'RetryStage';
  readonly stage: StageName;
  constructor(stage: StageName) {
    super(`retry ${stage}`);
    this.stage = stage;
  }
}

/** A loop's gate decided mid-body (right after its critic or check): leave the body with these ports. */
class LoopExit extends Error {
  override name = 'LoopExit';
  readonly loopId: string;
  /** threshold/clean: the gate passed; plateau/stopped: take the best snapshot; accepted: the cap's chosen version. */
  readonly reason: 'threshold' | 'clean' | 'plateau' | 'stopped' | 'accepted';
  readonly ports: Ports;
  readonly artifactId: string | undefined;
  constructor(loopId: string, reason: LoopExit['reason'], ports: Ports, artifactId?: string) {
    super(`loop ${loopId}: ${reason}`);
    this.loopId = loopId;
    this.reason = reason;
    this.ports = ports;
    this.artifactId = artifactId;
  }
}

interface LoopFrame {
  loop: Loop;
  round: number;
  /** Rounds allowed: the gate's max, raised once when a person asks to keep going at the cap. */
  max: number;
  raised: boolean;
  history: Score[];
  critiques: string[];
  /** The version each score was given to, with the view the critic saw. */
  snapshots: { artifactId: string; view?: ViewRef }[];
  probeChecked: boolean;
}

interface Ctx {
  stage: StageName;
  /** Candidate indices of the enclosing replicate/each, outermost first. */
  path: number[];
  /** The innermost loop whose gate a critic or check here reports to. */
  loop?: LoopFrame;
}

const SKIP_COMPOSITING = 'Compositing is not available in byway yet';
const SKIP_NO_EXECUTOR = 'This step has no executor in byway yet; the work passes through unchanged.';

export class Interpreter {
  private readonly input: RunInput;
  private readonly control: RunControl;
  private readonly seeds: string[] = [];
  private readonly occurrences = new Map<string, number>();
  private readonly gateRetries = new Map<string, number>();
  private checkpointCount = 0;
  private budgetQuestion: Promise<boolean> | undefined;
  private budgetCount = 0;

  constructor(input: RunInput, control: RunControl) {
    this.input = input;
    this.control = control;
  }

  private get run(): RunRef {
    const { runId, workspaceId, recipe, profileId, medium, problem } = this.input;
    return { runId, workspaceId, recipeId: recipe.id, profileId, medium, problem, seeds: [...this.seeds] };
  }

  /** A step's (or operator's) call at this place in the run; the key is stable across replays and retries. */
  private call(stepId: string, ctx: Ctx): StepCall {
    const where = ctx.path.length ? ctx.path.join('.') : '-';
    const k = `${stepId}|${where}`;
    const n = (this.occurrences.get(k) ?? 0) + 1;
    this.occurrences.set(k, n);
    const candidate = ctx.path.at(-1);
    return { key: `${this.input.runId}/${stepId}/${where}/${n}`, stepId, ...(candidate !== undefined ? { candidate } : {}), stage: ctx.stage };
  }

  // ---- Stages -----------------------------------------------------------------------------------------------------

  /** Run every stage; a gate's retry re-enters an earlier stage from the ports it started with. */
  async runStages(): Promise<Ports> {
    const stages = this.input.recipe.stages;
    const entries: Ports[] = [];
    let ports: Ports = this.input.inputs.voice ? { voice: this.input.inputs.voice } : {};
    let i = 0;
    while (i < stages.length) {
      const stage = stages[i]!;
      entries[i] = ports;
      try {
        ports = await this.node(stage.body, ports, { stage: stage.stage, path: [] });
        i++;
      } catch (e) {
        if (!(e instanceof RetryStage)) throw e;
        const j = stages.findIndex((s) => s.stage === e.stage);
        if (j < 0 || j > i) throw new RunFailure(`The recipe asks to re-run stage ${e.stage}, which has not run.`);
        ports = entries[j]!;
        i = j;
      }
    }
    return ports;
  }

  async node(n: Node, ports: Ports, ctx: Ctx): Promise<Ports> {
    switch (n.op) {
      case 'step':
        return this.step(n, ports, ctx);
      case 'seq': {
        let p = ports;
        for (const child of n.steps) p = await this.node(child, p, ctx);
        return p;
      }
      case 'replicate':
        return this.replicate(n, ports, ctx);
      case 'each':
        return this.each(n, ports, ctx);
      case 'pick':
        return this.pick(n, ports, ctx);
      case 'loop':
        return this.loop(n, ports, ctx);
      case 'route':
        return this.route(n, ports, ctx);
      case 'optional':
        return this.optional(n, ports, ctx);
      case 'audit':
        return this.audit(n, ports, ctx);
      case 'gate':
        return this.gate(n, ports, ctx);
      case 'relay':
        return this.relay(n, ports, ctx);
    }
  }

  // ---- Activities, budget and failures ----------------------------------------------------------------------------

  /**
   * Run one activity for a step. A refused budget asks "Raise the budget by $X?" and, if approved, raises it and runs
   * the activity again; declined, the run fails with a plain message. Any other failure is recorded as step-failed.
   */
  private async act<T>(call: StepCall, fn: () => Promise<T>): Promise<T> {
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        // A person's answer that cannot be used as it is goes back to the step that asked (ENG-6): not a failure.
        if (isCancellation(e) || rejectedAnswer(e) !== undefined) throw e;
        const budget = budgetDetails(e);
        if (budget) {
          if (await this.askBudget(call, budget)) continue;
          const message = `The run stopped at its ${budget.scope === 'workspace' ? 'workspace ' : ''}budget of $${budget.capUsd.toFixed(2)}, and the budget was not raised.`;
          await this.emit([{ type: 'step-failed', stepId: call.stepId, ...cand(call), data: { error: message, retryable: false }, dedupeKey: `${call.key}/step-failed` }]);
          throw new RunFailure(message);
        }
        const message = failureMessage(e);
        const retryable = e instanceof ActivityFailure && e.cause instanceof ApplicationFailure ? !e.cause.nonRetryable : false;
        await this.emit([{ type: 'step-failed', stepId: call.stepId, ...cand(call), data: { error: message, retryable }, dedupeKey: `${call.key}/step-failed` }]);
        throw new RunFailure(message);
      }
    }
  }

  /** One budget question at a time: concurrent candidates that hit the cap wait for the same answer. */
  private async askBudget(call: StepCall, b: BudgetFailureDetails): Promise<boolean> {
    if (this.budgetQuestion) return this.budgetQuestion;
    const question = (async () => {
      const amount = raiseAmount(b.shortfallUsd);
      const n = ++this.budgetCount;
      const res = await this.ask(call, { kind: 'confirm', prompt: budgetPrompt(amount, b.scope) });
      if (!res.approved) return false;
      await quick.raiseBudget({ runId: this.input.runId, workspaceId: this.input.workspaceId, scope: b.scope, amountUsd: amount, dedupeKey: `${this.input.runId}/budget/${n}` });
      return true;
    })();
    this.budgetQuestion = question;
    try {
      return await question;
    } finally {
      this.budgetQuestion = undefined;
    }
  }

  private emit(events: WorkflowEvent[]): Promise<void> {
    return quick.emitEvents({ runId: this.input.runId, events });
  }

  // ---- Checkpoints ------------------------------------------------------------------------------------------------

  /**
   * Open a checkpoint and wait for its answer. The answer arrives through the RESOLVE_UPDATE Update, which validates it
   * against this checkpoint and records it before this resumes.
   */
  async ask(call: StepCall, spec: Omit<CheckpointSpec, 'id'>, extra: Pick<OpenCheckpointInput, 'step' | 'initial'> = {}): Promise<CheckpointResolution & { initialText?: string }> {
    await this.control.boundary();
    const id = `${this.input.runId}/cp${++this.checkpointCount}-${call.stepId}`;
    const entry: PendingCheckpoint = { cp: { id, kind: spec.kind, ...(spec.options ? { options: spec.options } : {}), ...(spec.k !== undefined ? { k: spec.k } : {}) }, call, recording: false };
    this.control.pending.set(id, entry);
    try {
      const opened = await this.act(call, () => quick.openCheckpoint({ run: this.run, call, checkpoint: { id, ...spec }, ...extra }));
      await condition(() => entry.resolution !== undefined);
      return { ...entry.resolution!, ...(opened.initialText !== undefined ? { initialText: opened.initialText } : {}) };
    } finally {
      this.control.pending.delete(id);
    }
  }

  // ---- Steps ------------------------------------------------------------------------------------------------------

  private async step(s: Step, ports: Ports, ctx: Ctx): Promise<Ports> {
    const call = this.call(s.id, ctx);
    if (s.actor === 'human') return this.human(s, ports, ctx, call);
    const out = await this.control.machine(async (): Promise<Ports> => {
      const spec = toStepSpec(s);
      if (s.actor === 'tool') {
        if (s.role === 'render') {
          const pool = s.consumes.includes('option_set<artifact>') && !s.consumes.includes('artifact');
          const ids = pool ? (ports.options ?? []) : ports.artifact ? [ports.artifact] : [];
          if (!ids.length) throw new RunFailure(`There is nothing to render at step "${s.id}".`);
          const { view } = await this.act(call, () => model.renderView({ run: this.run, call, step: spec, artifactIds: ids, pool }));
          return pool ? { ...ports, view, optionViews: view.items } : { ...ports, view };
        }
        await this.act(call, () => quick.skipStep({ run: this.run, call, step: spec, note: s.role === 'relay' ? SKIP_COMPOSITING : SKIP_NO_EXECUTOR }));
        return ports;
      }
      if (s.actor === 'policy') {
        await this.act(call, () => quick.skipStep({ run: this.run, call, step: spec, note: SKIP_NO_EXECUTOR }));
        return ports;
      }
      if (s.role === 'asset') {
        const res = await this.act(call, () => media.assetStep({ run: this.run, call, step: spec, ports }));
        const out: Ports = { ...ports };
        if (res.artifactId) Object.assign(out, { previousArtifact: ports.artifact, artifact: res.artifactId });
        if (res.asset) out.asset = [...(ports.asset ?? []), ...res.asset];
        if (res.anchor) out.anchor = res.anchor;
        return out;
      }
      if (s.role === 'relay') {
        let shot = ports.shot;
        if (shot === undefined) {
          // A relay step outside the chain (C5 render-in-scene) works on the final shot, from the chain's last frame.
          if (!ports.artifact) throw new RunFailure(`There is no storyboard for step "${s.id}".`);
          const shots = await this.act(call, () => quick.storyboardShots({ artifactId: ports.artifact! }));
          shot = shots.at(-1) ?? 1;
        }
        const res = await this.act(call, () => media.relayLink({ run: this.run, call, step: spec, ports, shot: shot! }));
        const out: Ports = { ...ports };
        if (res.artifactId) Object.assign(out, { previousArtifact: ports.artifact, artifact: res.artifactId });
        if (res.anchor) out.anchor = res.anchor;
        return out;
      }
      if (s.role === 'fix' && s.consumes.includes('critique') && ports.nothingToRemove) {
        // An empty CUT directive: there is nothing to apply, so no model is asked and the work stays as it is.
        await this.act(call, () => quick.passStep({ run: this.run, call, step: spec, note: NOTHING_TO_REMOVE }));
        return withCritique(ports, ports.critique);
      }
      const res = await this.act(call, () =>
        model.modelStep({ run: this.run, call, step: spec, ports, refs: this.input.inputs.refs ?? [], ...(this.input.inputs.tells ? { tells: this.input.inputs.tells } : {}), ...(ctx.loop ? { round: ctx.loop.round } : {}) }),
      );
      if (res.seed) this.seeds.push(res.seed);
      return this.applyModel(s, ports, res);
    });
    // The loop's gate is applied after the step has finished, so a pause or a question at the cap is not "in flight".
    if (ctx.loop && s.actor === 'model' && (s.role === 'critic' || s.role === 'check')) await this.afterGateStep(s, out, ctx.loop, ctx, call);
    return out;
  }

  /** A model step's outputs, mapped onto the ports it produces. */
  private applyModel(s: Step, ports: Ports, res: ModelStepResult): Ports {
    let out: Ports = { ...ports };
    if (res.artifactId) Object.assign(out, { previousArtifact: ports.artifact, artifact: res.artifactId });
    if (res.text !== undefined) {
      if (s.role === 'vision') {
        if (s.produces.includes('brief')) out.brief = res.text;
        if (s.produces.includes('taste')) out.taste = res.text;
        if (s.produces.includes('critique')) out = withCritique(out, res.text);
      } else {
        out = withCritique(out, res.text, res.nothingToRemove === true);
      }
    }
    if (res.score) out.score = res.score;
    if (res.noteArtifactId) out.notes = [res.noteArtifactId];
    if (res.keep === 'A' && ports.previousArtifact) Object.assign(out, { artifact: ports.previousArtifact, previousArtifact: ports.artifact });
    if (res.keep) out.taste = res.keep === 'A' ? 'Kept the version from before the cliché sweep.' : 'Kept the swaps.';
    if (res.keepLabels) {
      const keep = res.keepLabels.map(indexOfLabel);
      out.options = keep.map((i) => (ports.options ?? [])[i]!).filter(Boolean);
      if (ports.optionViews) out.optionViews = keep.map((i) => ports.optionViews![i]);
    }
    return out;
  }

  private async human(s: Step, ports: Ports, ctx: Ctx, call: StepCall): Promise<Ports> {
    const kind = humanKind(s);
    const spec = toStepSpec(s);
    const round = ctx.loop?.round;
    // What the person looks at: the candidates for a step over an option set, else the view it consumes.
    const viewIds = (v: ViewRef | undefined) => (v ? [...(v.textArtifactId ? [v.textArtifactId] : []), ...v.imageArtifactIds] : []);
    const shown = s.consumes.includes('option_set<artifact>')
      ? (ports.options ?? []).flatMap((id, i) => {
          const v = viewIds(ports.optionViews?.[i]);
          return v.length ? v : [id];
        })
      : (ports.view?.items.flatMap(viewIds) ?? []);
    let checkpoint: Omit<CheckpointSpec, 'id'> = { kind, prompt: humanPrompt(s, round) };
    let initial: OpenCheckpointInput['initial'];
    if (kind === 'compare') {
      checkpoint = {
        ...checkpoint,
        options: [
          { id: 'A', label: 'Before the sweep', ...(ports.previousArtifact ? { artifactId: ports.previousArtifact } : {}) },
          { id: 'B', label: 'After the swaps', ...(ports.artifact ? { artifactId: ports.artifact } : {}) },
        ],
      };
    } else if (kind === 'write') {
      if (s.role === 'voice') initial = { from: s.variant === 'claim-log' ? 'claims' : 'copy', ...(ports.artifact ? { artifactId: ports.artifact } : {}) };
      // The author revises their own last draft; the first time, they start from the draft they brought (or nothing),
      // never from a machine's text (a seed card or a premise is not their draft).
      else if (ports.artifact && ports.artifact === ports.authored) initial = { from: 'artifact', artifactId: ports.artifact };
      else initial = { from: 'draft', ...(this.input.inputs.draft ? { draft: this.input.inputs.draft } : {}) };
      checkpoint.artifactIds = ports.artifact ? [ports.artifact] : [];
    } else {
      // Beside the work: the latest notes (an audit's annotations, a model's framings or direction).
      const work = shown.length ? shown : ports.artifact ? [ports.artifact] : [];
      checkpoint.artifactIds = [...work, ...(ports.notes ?? []).filter((id) => !work.includes(id))];
    }
    const res = await this.ask(call, checkpoint, { step: spec, ...(initial ? { initial } : {}) });
    // What the checkpoint first offered: "unchanged" is measured against it, however often the person is asked again.
    const { initialText: offered, ...first } = res;
    let resolution: CheckpointResolution = first;
    let fin;
    for (;;) {
      // Writing the answer back (VOICE may call the model) is the rest of this step: a pause waits for it.
      const finish = { run: this.run, call, step: spec, kind, resolution, ports, ...(offered !== undefined ? { initialText: offered } : {}) };
      try {
        fin = await this.control.track(() => this.act(call, () => model.finishHumanStep(finish)));
        break;
      } catch (e) {
        const problem = rejectedAnswer(e);
        if (problem === undefined) throw e;
        // Asked again, starting from what they wrote, with why it could not be used (ENG-6).
        const { initialText: _again, ...next } = await this.ask(call, { ...checkpoint, prompt: `${problem} ${checkpoint.prompt}`, initialText: resolution.text ?? '' }, { step: spec });
        resolution = next;
      }
    }
    let out: Ports = { ...ports };
    const text = fin.text ?? '';
    switch (kind) {
      case 'compare':
        if (fin.keep === 'A' && ports.previousArtifact) Object.assign(out, { artifact: ports.previousArtifact, previousArtifact: ports.artifact });
        out.taste = fin.keep === 'A' ? 'Kept the version from before the cliché sweep.' : 'Kept the swaps.';
        break;
      case 'write':
        if (fin.artifactId) Object.assign(out, { previousArtifact: ports.artifact, artifact: fin.artifactId, ...(s.role !== 'voice' ? { authored: fin.artifactId } : {}) });
        if (s.produces.includes('voice')) out.voice = text;
        break;
      case 'directive':
        // A person who lists nothing to remove gives an empty directive, as a model's "Nothing to remove." does.
        out = withCritique(out, text, !text.trim());
        break;
      default:
        if (s.produces.includes('brief')) out.brief = text;
        if (s.produces.includes('taste')) out.taste = text;
        if (s.produces.includes('critique')) out = withCritique(out, text);
    }
    return out;
  }

  // ---- Candidates -------------------------------------------------------------------------------------------------

  private async replicate(r: Replicate, ports: Ports, ctx: Ctx): Promise<Ports> {
    const n = Math.max(1, r.n);
    const outs = await Promise.all(Array.from({ length: n }, (_, i) => this.node(r.body, ports, { stage: ctx.stage, path: [...ctx.path, i] })));
    const kept = outs.filter((o) => o.artifact);
    return { ...ports, options: kept.map((o) => o.artifact!), optionViews: kept.map((o) => (o.view && !o.view.pool ? o.view.items[0] : undefined)) };
  }

  private async each(e: Each, ports: Ports, ctx: Ctx): Promise<Ports> {
    const ids = ports.options ?? (ports.artifact ? [ports.artifact] : []);
    const outs = await Promise.all(
      ids.map((id, i) => {
        const view = ports.optionViews?.[i];
        const start: Ports = { ...ports, artifact: id, previousArtifact: undefined, view: view ? { pool: false, items: [view] } : undefined, options: undefined, optionViews: undefined };
        return this.node(e.body, start, { stage: ctx.stage, path: [...ctx.path, i] });
      }),
    );
    return { ...ports, options: outs.map((o, i) => o.artifact ?? ids[i]!), optionViews: outs.map((o) => (o.view && !o.view.pool ? o.view.items[0] : undefined)) };
  }

  private async pick(p: PickNode, ports: Ports, ctx: Ctx): Promise<Ports> {
    const ids = ports.options ?? (ports.artifact ? [ports.artifact] : []);
    if (!ids.length) throw new RunFailure(`There is nothing to choose from at "${p.id}".`);
    const k = Math.min(Math.max(1, p.k), ids.length);
    const call = this.call(p.id, ctx);
    let chosen: number[];
    if (ids.length <= k) {
      chosen = ids.map((_, i) => i);
    } else if (p.mode === 'H') {
      await this.emit([{ type: 'step-started', stepId: p.id, ...cand(call), data: { label: k === 1 ? 'Pick one' : `Pick ${k}`, stage: ctx.stage, role: 'pick', actor: 'human' }, dedupeKey: `${call.key}/step-started` }]);
      const res = await this.ask(call, {
        kind: 'pick',
        prompt: k === 1 ? 'Pick the draft to take forward.' : `Pick the ${k} drafts to take forward.`,
        options: ids.map((id, i) => ({ id: labelOf(i), label: `Draft ${labelOf(i)}`, artifactId: id })),
        k,
        artifactIds: (ports.optionViews ?? []).flatMap((v) => (v?.imageArtifactIds[0] ? [v.imageArtifactIds[0]] : v?.textArtifactId ? [v.textArtifactId] : [])),
      });
      chosen = (res.choice ?? []).map(indexOfLabel);
      await this.emit([{ type: 'step-finished', stepId: p.id, ...cand(call), data: { costUsd: 0, outputArtifactIds: chosen.map((i) => ids[i]!) }, dedupeKey: `${call.key}/step-finished` }]);
    } else if (p.mode === 'C') {
      if (!p.judge) throw new RunFailure(`The choice at "${p.id}" has no judge step.`);
      chosen = [];
      let left = ids.map((_, i) => i);
      while (chosen.length < k) {
        const candidates = left.map((i) => ids[i]!);
        const res = await this.control.machine(() =>
          this.act(call, () => model.modelStep({ run: this.run, call: this.call(p.judge!.id, ctx), step: toStepSpec(p.judge!), ports, refs: [], candidates })),
        );
        const at = indexOfLabel(res.label ?? 'A');
        chosen.push(left[at]!);
        left = left.filter((_, j) => j !== at);
      }
    } else {
      const order = ids.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      chosen = order.slice(0, k).sort((a, b) => a - b);
      await this.emit([
        { type: 'step-started', stepId: p.id, ...cand(call), data: { label: 'Pick at random', stage: ctx.stage, role: 'pick', actor: 'policy' }, dedupeKey: `${call.key}/step-started` },
        { type: 'step-finished', stepId: p.id, ...cand(call), data: { costUsd: 0, outputArtifactIds: chosen.map((i) => ids[i]!) }, dedupeKey: `${call.key}/step-finished` },
      ]);
    }
    const options = chosen.map((i) => ids[i]!);
    const optionViews = chosen.map((i) => ports.optionViews?.[i]);
    const first = optionViews[0];
    return { ...ports, options, optionViews, artifact: options[0], previousArtifact: undefined, view: first ? { pool: false, items: [first] } : ports.view };
  }

  // ---- Loops ------------------------------------------------------------------------------------------------------

  /**
   * A loop until its hidden gate (02 §2). Critic and check gates are decided right after the critic or check inside the
   * body (afterGateStep), so a version that passes is not "fixed" again; a person's gate (`human`) asks "Is this
   * ready?" after each round. Every way out but the threshold ends with the best version: by a fresh re-rank of the
   * top snapshots (plateau, a stopped probe, the cap by policy), or by the person at the cap.
   */
  private async loop(l: Loop, ports: Ports, ctx: Ctx): Promise<Ports> {
    const g = l.gate;
    const frame: LoopFrame = { loop: l, round: 0, max: Math.max(1, g.max), raised: false, history: [], critiques: [], snapshots: [], probeChecked: false };
    const scored = g.metric === 'critic-score' || g.metric === 'critic-rank';
    let current = ports;
    for (;;) {
      frame.round++;
      let exit: LoopExit | undefined;
      try {
        current = await this.node(l.body, current, { ...ctx, loop: frame });
      } catch (e) {
        if (!(e instanceof LoopExit) || e.loopId !== l.id) throw e;
        exit = e;
        current = e.ports;
      }
      if (exit) {
        if (exit.reason === 'threshold' || exit.reason === 'clean') return current;
        if (exit.reason === 'accepted') return exit.artifactId && exit.artifactId !== current.artifact ? this.withArtifact(current, exit.artifactId, frame) : current;
        return scored ? this.bestOf(frame, current, ctx) : current;
      }
      if (g.metric === 'human') {
        const call = this.call(l.id, ctx);
        await this.iteration(frame, call);
        if (frame.round >= frame.max) return current;
        const res = await this.ask(call, { kind: 'confirm', prompt: READY_PROMPT, ...(current.artifact ? { artifactIds: [current.artifact] } : {}) });
        if (res.approved) return current;
        continue;
      }
      // A body that ran to its end without its gate deciding (no critic or check reported): the cap bounds it.
      if (frame.round >= frame.max) return scored ? this.bestOf(frame, current, ctx) : current;
    }
  }

  private withArtifact(ports: Ports, artifactId: string, frame: LoopFrame): Ports {
    const snap = frame.snapshots.find((s) => s.artifactId === artifactId);
    return { ...ports, previousArtifact: ports.artifact, artifact: artifactId, ...(snap?.view ? { view: { pool: false, items: [snap.view] } } : {}) };
  }

  private async bestOf(frame: LoopFrame, ports: Ports, ctx: Ctx): Promise<Ports> {
    const best = await this.bestVersion(frame, ctx);
    return best && best !== ports.artifact ? this.withArtifact(ports, best, frame) : ports;
  }

  /** Best-snapshot selection: the top 2–3 scored versions re-ranked in a fresh judge call (purpose rerank:<medium>). */
  private async bestVersion(frame: LoopFrame, ctx: Ctx): Promise<string | undefined> {
    const top = bestSnapshots(frame.history, 3).map((i) => frame.snapshots[i]!);
    const unique = top.filter((s, i) => top.findIndex((t) => t.artifactId === s.artifactId) === i);
    if (unique.length <= 1) return unique[0]?.artifactId;
    const call = this.call(frame.loop.id, ctx);
    const res = await this.control.machine(() => this.act(call, () => model.rerank({ run: this.run, call, snapshots: unique.map((s) => ({ artifactId: s.artifactId, ...(s.view ? { view: s.view } : {}) })) })));
    return unique[res.index]?.artifactId ?? unique[0]!.artifactId;
  }

  private iteration(frame: LoopFrame, call: StepCall, score?: Score): Promise<void> {
    const extra = score?.kind === 'rank' ? { rank: score.rank, of: score.of } : {};
    return this.emit([
      {
        type: 'loop-iteration',
        stepId: frame.loop.id,
        ...cand(call),
        data: { iteration: frame.round, max: frame.max, ...(score?.kind === 'score' ? { score: score.value } : {}), ...extra },
        dedupeKey: `${call.key}/iteration/${frame.round}`,
      },
    ]);
  }

  /**
   * Right after a loop's critic or check: apply the hidden gate. The threshold is compared here, never in a prompt;
   * then the probe, the plateau rule and the cap. Throws LoopExit to leave the body before its fix runs. At the cap a
   * person (onCap: human) is asked "Use the best version so far?"; "no" raises the cap once and the round goes on.
   */
  private async afterGateStep(s: Step, ports: Ports, frame: LoopFrame, ctx: Ctx, stepCall: StepCall): Promise<void> {
    const g = frame.loop.gate;
    const id = frame.loop.id;
    if (s.role === 'check' && g.metric === 'check-clean') {
      await this.iteration(frame, stepCall);
      if (ports.critique?.trim() === 'No defects.') throw new LoopExit(id, 'clean', ports);
      if (frame.round >= frame.max) await this.atCap(frame, ports, ctx, ports.artifact);
      return;
    }
    if (s.role !== 'critic' || !ports.score || (g.metric !== 'critic-score' && g.metric !== 'critic-rank')) return;
    const score = ports.score;
    frame.history.push(score);
    frame.critiques.push(ports.critique ?? '');
    frame.snapshots.push({ artifactId: ports.artifact!, ...(ports.view && !ports.view.pool ? { view: ports.view.items[0]! } : {}) });
    await this.iteration(frame, stepCall, score);
    if (passes(score, g.metric, g.threshold)) throw new LoopExit(id, 'threshold', ports);
    if (!frame.probeChecked && frame.history.length >= g.probe + 1) {
      frame.probeChecked = true;
      if (!converging(frame.history, frame.critiques) && g.onNoConverge === 'recalibrate-human') {
        const res = await this.ask(this.call(id, ctx), { kind: 'confirm', prompt: NOT_CONVERGING_PROMPT, ...(ports.artifact ? { artifactIds: [ports.artifact] } : {}) });
        if (!res.approved) throw new LoopExit(id, 'stopped', ports);
      }
    }
    if (plateaued(frame.history, g.plateau, g.probe)) throw new LoopExit(id, 'plateau', ports);
    if (frame.round >= frame.max) await this.atCap(frame, ports, ctx, await this.bestVersion(frame, ctx));
  }

  /** The cap (02 §2): by policy, the best snapshot; with a person, their call, and a "no" raises the cap once. */
  private async atCap(frame: LoopFrame, ports: Ports, ctx: Ctx, best: string | undefined): Promise<void> {
    const id = frame.loop.id;
    if (frame.loop.gate.onCap !== 'human' || frame.raised) throw new LoopExit(id, 'accepted', ports, best);
    const res = await this.ask(this.call(id, ctx), { kind: 'confirm', prompt: BEST_SO_FAR_PROMPT, ...(best ? { artifactIds: [best] } : {}) });
    if (res.approved) throw new LoopExit(id, 'accepted', ports, best);
    frame.raised = true;
    frame.max += Math.max(1, frame.loop.gate.max);
  }

  // ---- Choices ----------------------------------------------------------------------------------------------------

  private async route(r: Route, ports: Ports, ctx: Ctx): Promise<Ports> {
    let name = this.input.routes[r.id];
    if (!r.branches.some((b) => b.name === name)) {
      const res = await this.ask(this.call(r.id, ctx), { kind: 'choose', prompt: routePrompt(r.on), options: r.branches.map((b) => ({ id: b.name, label: b.name })) });
      name = res.choice?.[0];
    }
    const branch = r.branches.find((b) => b.name === name) ?? r.branches[0]!;
    return this.node(branch.body, ports, ctx);
  }

  private async optional(o: Optional, ports: Ports, ctx: Ctx): Promise<Ports> {
    const call = this.call(o.id, ctx);
    const res = await this.ask(call, { kind: 'confirm', prompt: optionalPrompt(o.trigger, call.candidate), ...(ports.artifact ? { artifactIds: [ports.artifact] } : {}) });
    if (res.approved) return this.node(o.body, ports, ctx);
    // Declined (UX-1, convention C1): the step it asked about finished as skipped, and says why, so the run's timeline
    // and its result list it as not done instead of leaving it in progress.
    await this.emit([
      { type: 'step-started', stepId: o.id, ...cand(call), data: { label: 'Optional step', stage: ctx.stage, role: 'optional', actor: 'human' }, dedupeKey: `${call.key}/step-started` },
      { type: 'step-finished', stepId: o.id, ...cand(call), data: { costUsd: 0, skipped: true, note: DECLINED_NOTE }, dedupeKey: `${call.key}/step-finished` },
    ]);
    return ports;
  }

  // ---- Annotations, gates, relays --------------------------------------------------------------------------------

  /** Lenses read the same input concurrently; their critiques are joined under their names and nothing else changes. */
  private async audit(a: Audit, ports: Ports, ctx: Ctx): Promise<Ports> {
    const outs = await Promise.all(a.lenses.map((lens) => this.node(lens.body, ports, { stage: ctx.stage, path: ctx.path })));
    const joined = outs.flatMap((o, i) => (o.critique && o.critique !== ports.critique ? [`## ${a.lenses[i]!.name}\n${o.critique.trim()}`] : []));
    const notes = outs.flatMap((o) => (o.notes && o.notes !== ports.notes ? o.notes : []));
    const annotated = joined.length ? withCritique(ports, joined.join('\n\n')) : ports;
    return { ...annotated, ...(notes.length ? { notes } : {}) };
  }

  private async gate(g: OneShotGate, ports: Ports, ctx: Ctx): Promise<Ports> {
    const out = await this.node(g.body, ports, { stage: ctx.stage, path: ctx.path });
    const verdict = out.score && passes(out.score, g.pass.metric, g.pass.threshold);
    const kept: Ports = { ...ports, ...(out.critique ? { critique: out.critique } : {}) };
    if (verdict) return kept;
    const call = this.call(g.id, ctx);
    const used = this.gateRetries.get(g.id) ?? 0;
    if (g.retry && used < g.retry.times) {
      this.gateRetries.set(g.id, used + 1);
      await this.emit([
        { type: 'step-started', stepId: g.id, ...cand(call), data: { label: 'Final check', stage: ctx.stage, role: 'gate', actor: 'policy' }, dedupeKey: `${call.key}/step-started` },
        { type: 'step-finished', stepId: g.id, ...cand(call), data: { costUsd: 0, note: GATE_RETRY_NOTE }, dedupeKey: `${call.key}/step-finished` },
      ]);
      throw new RetryStage(g.retry.stage);
    }
    const res = await this.ask(call, { kind: 'confirm', prompt: GATE_FAILED_PROMPT, ...(ports.artifact ? { artifactIds: [ports.artifact] } : {}) });
    if (res.approved) return kept;
    throw new RunFailure('The run stopped: the result did not pass the final check, and you chose not to use it.');
  }

  /** One link per storyboard shot (up to maxLinks), strictly in sequence, each starting from the previous anchor. */
  private async relay(r: RelayChain, ports: Ports, ctx: Ctx): Promise<Ports> {
    if (!ports.artifact) throw new RunFailure(`There is no storyboard for the relay "${r.id}".`);
    const call = this.call(r.id, ctx);
    const shots = await this.act(call, () => quick.storyboardShots({ artifactId: ports.artifact! }));
    let current = ports;
    // Every relay step of a link starts from the frame the link started from: a regeneration redoes the link, it does
    // not continue from the defective clip's end.
    for (const shot of shots.slice(0, Math.max(0, r.maxLinks))) current = await this.node(r.body, { ...current, shot, linkStart: current.anchor }, ctx);
    const { shot: _done, linkStart: _start, ...rest } = current;
    return rest;
  }
}

const cand = (call: StepCall): { candidate?: number } => (call.candidate !== undefined ? { candidate: call.candidate } : {});

/**
 * Ports with a new critique. `empty` marks an empty CUT directive, which the next fix passes over (spec §3.3 "Nothing to
 * remove."); any other critique, or no critique at all, clears that mark.
 */
function withCritique(ports: Ports, critique: string | undefined, empty = false): Ports {
  const { nothingToRemove: _was, critique: _old, ...rest } = ports;
  return { ...rest, ...(critique !== undefined ? { critique } : {}), ...(empty ? { nothingToRemove: true } : {}) };
}

/** The problem with a person's answer that an activity could not use as it is (ENG-6), or undefined. */
function rejectedAnswer(e: unknown): string | undefined {
  const cause = e instanceof ActivityFailure ? e.cause : e;
  if (!(cause instanceof ApplicationFailure) || cause.type !== FAILURE.rejected) return undefined;
  const d = cause.details?.[0] as RejectedAnswerDetails | undefined;
  return typeof d?.problem === 'string' ? d.problem : cause.message;
}

function budgetDetails(e: unknown): BudgetFailureDetails | undefined {
  const cause = e instanceof ActivityFailure ? e.cause : e;
  if (!(cause instanceof ApplicationFailure) || cause.type !== FAILURE.budget) return undefined;
  const d = cause.details?.[0] as BudgetFailureDetails | undefined;
  return d && typeof d.shortfallUsd === 'number' ? d : { scope: 'run', capUsd: 0, shortfallUsd: 1 };
}

/** The plain message of a failure: the activity's own message, not Temporal's wrapper. */
export function failureMessage(e: unknown): string {
  if (e instanceof RunFailure) return e.message;
  if (e instanceof ActivityFailure && e.cause) return failureMessage(e.cause);
  if (e instanceof ApplicationFailure) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
