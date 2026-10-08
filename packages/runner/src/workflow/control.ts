/**
 * The run's controls inside the workflow: pause between steps, cancel at any point, the run status the app shows,
 * and the checkpoints waiting for an answer. Workflow code: deterministic, no I/O except through activities.
 */
import { condition } from '@temporalio/workflow';
import type { CheckpointRecord, CheckpointResolution } from '@byway/contracts';
import type { StepCall } from '../types.ts';
import { quick } from './acts.ts';

export interface PendingCheckpoint {
  cp: Pick<CheckpointRecord, 'id' | 'kind' | 'options' | 'k'>;
  call: StepCall;
  /** Set while the answer is being written, so a second answer to the same checkpoint is refused. */
  recording: boolean;
  resolution?: CheckpointResolution;
}

export class RunControl {
  readonly runId: string;
  pauseRequested = false;
  paused = false;
  cancelRequested = false;
  /** The run reached its end (done, failed or cancelled): background loops stop and answers are refused. */
  finished = false;
  /** Machine steps in flight; a pause takes effect when none is. */
  activeSteps = 0;
  readonly pending = new Map<string, PendingCheckpoint>();

  constructor(runId: string) {
    this.runId = runId;
  }

  /** What the app shows: paused, waiting for you (any checkpoint open), or running. */
  desiredStatus(): 'running' | 'waiting' | 'paused' {
    if (this.paused) return 'paused';
    for (const p of this.pending.values()) if (!p.resolution) return 'waiting';
    return 'running';
  }

  /** A step boundary: a paused run starts nothing new until it is resumed (or cancelled, which throws here). */
  async boundary(): Promise<void> {
    if (this.pauseRequested) await condition(() => !this.pauseRequested);
  }

  /** Run one machine step: past the pause boundary, counted as in flight until it finishes. */
  async machine<T>(fn: () => Promise<T>): Promise<T> {
    await this.boundary();
    this.activeSteps++;
    try {
      return await fn();
    } finally {
      this.activeSteps--;
    }
  }

  /**
   * Two background loops for the run's life: one turns pause requests into a paused run once no step is in flight
   * (run-paused / run-resumed), the other writes the status the app shows whenever it changes, in order.
   */
  startLoops(): Promise<void> {
    const pauses = (async () => {
      let n = 0;
      for (;;) {
        await condition(() => this.finished || (this.pauseRequested && !this.paused && this.activeSteps === 0) || (!this.pauseRequested && this.paused));
        if (this.finished) return;
        if (this.pauseRequested && !this.paused) {
          this.paused = true;
          n++;
          await quick.emitEvents({ runId: this.runId, events: [{ type: 'run-paused', data: {}, dedupeKey: `${this.runId}/paused/${n}` }] });
        } else {
          this.paused = false;
          await quick.emitEvents({ runId: this.runId, events: [{ type: 'run-resumed', data: {}, dedupeKey: `${this.runId}/resumed/${n}` }] });
        }
      }
    })();
    const statuses = (async () => {
      let written: string = 'running';
      for (;;) {
        await condition(() => this.finished || this.desiredStatus() !== written);
        if (this.finished) return;
        const status = this.desiredStatus();
        await quick.setRunStatus({ runId: this.runId, status });
        written = status;
      }
    })();
    return Promise.all([pauses, statuses]).then(() => undefined);
  }
}
