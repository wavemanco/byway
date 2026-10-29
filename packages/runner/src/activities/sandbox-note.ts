/**
 * The run's note when a step's pages were drawn with the page renderer's OS sandbox off (ADR-0105). The person can
 * switch the sandbox off in Settings; while it is off, each step call whose pages (renders, visitor reads, cards) were
 * drawn without it says so, once, in a 'renderer-sandbox-off' event that the Run and Result screens show with the step's
 * notes. The note is written as the first such page is drawn, while the step runs, so it lands with the step's other
 * events. byway's own test page (the readiness check) is not a step's page and never counts.
 */
import type { Store } from '@byway/contracts';
import type { PageRenderer, RenderOptions } from '../pages.ts';
import type { StepCall } from '../types.ts';
import { at, emit } from './events.ts';

/** The note, in plain words. */
export const SANDBOX_OFF_NOTE = "Pages in this step were drawn with the page renderer's OS sandbox off (it was switched off in Settings).";

export interface SandboxWatch {
  /** The renderer as the step sees it: each load tells the watch the setting it was drawn under. */
  pages: PageRenderer;
  /** Waits for the note, if one is being written; a note that could not be written is not the step's failure. */
  settled(): Promise<void>;
}

/** Watches a step's pages; the first drawn with the sandbox off writes the note (once per step call, by its key). */
export function watchSandbox(inner: PageRenderer, store: Store, step: { runId: string; call: StepCall } | undefined): SandboxWatch {
  let writing: Promise<unknown> | undefined;
  const drawn = (how: { osSandbox: boolean }) => {
    if (how.osSandbox || !step || writing) return;
    writing = emit(store, step.runId, 'renderer-sandbox-off', { note: SANDBOX_OFF_NOTE }, at(step.call, 'renderer-sandbox-off')).catch(() => undefined);
  };
  const told = (opts: RenderOptions | undefined): RenderOptions => ({
    ...opts,
    drawn: (how) => {
      drawn(how);
      opts?.drawn?.(how);
    },
  });
  return {
    pages: {
      screenshots: (html, resolve, opts) => inner.screenshots(html, resolve, told(opts)),
      render: (html, resolve, surfaces, opts) => inner.render(html, resolve, surfaces, told(opts)),
      shownText: (html, resolve, opts) => inner.shownText(html, resolve, told(opts)),
      ready: () => inner.ready(),
      close: () => inner.close(),
    },
    settled: async () => {
      await writing;
    },
  };
}
