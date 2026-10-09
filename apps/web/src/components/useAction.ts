'use client';

/**
 * One owner for "an action in flight" (R5). A control that starts something (sends an answer, starts a paid run, asks
 * for a recommendation) is busy until it finishes, and a second press meanwhile must do nothing. The DOM `disabled`
 * attribute did both jobs before, at a cost: a focused control that disables itself drops keyboard focus to the page
 * body, and screen readers lose their place. So every such control stays focusable and says it is unavailable with
 * aria-disabled (ActionButton), and the second press is refused here, synchronously, before React has re-rendered the
 * control as busy. Run start has no server-side idempotency, so on Start and the paid Start button this guard is what
 * stops a double press starting two runs.
 *
 * The rule for the app (apps/web README, guard-disabled.test.ts): no `disabled` on a control a person presses; a busy or
 * unavailable control is an ActionButton (or carries actionAttributes and blockActivation) and its action runs through
 * useAction.
 */
import { useCallback, useRef, useState, type SyntheticEvent } from 'react';

/**
 * What an action asks of its guard when it finishes: 'release' (the default) frees the control; 'hold' keeps it busy,
 * for an action that leaves the screen on success (Start goes to the next page), so it cannot be pressed again while
 * that page loads.
 */
export type Settle = 'release' | 'hold';

export interface InFlight {
  /** Whether an action is running (or held). */
  readonly running: boolean;
  /**
   * Runs `action` unless one is already running, and returns whether it ran. The check and the claim are synchronous,
   * so a second call in the same tick is refused. An action that throws is released, and the error is thrown on.
   */
  run(action: () => Promise<Settle | void> | Settle | void): Promise<boolean>;
}

/** The guard behind useAction, outside React so it can be tested alone. `onChange` hears when it becomes busy or free. */
export function createInFlight(onChange: (busy: boolean) => void = () => undefined): InFlight {
  let running = false;
  return {
    get running() {
      return running;
    },
    async run(action) {
      if (running) return false;
      running = true;
      onChange(true);
      let settle: Settle | void = 'release';
      try {
        settle = await action();
      } finally {
        if (settle !== 'hold') {
          running = false;
          onChange(false);
        }
      }
      return true;
    },
  };
}

/**
 * An action with its in-flight state: `busy` for the control to show, and `run`, which starts the action unless it is
 * already running (the second press of a double press, Enter in a field while sending, a shortcut). `action` is read at
 * the call, so it always sees the latest render's values.
 */
export function useAction<A extends unknown[]>(action: (...args: A) => Promise<Settle | void> | Settle | void): { busy: boolean; run: (...args: A) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const gate = useRef<InFlight | null>(null);
  gate.current ??= createInFlight(setBusy);
  const latest = useRef(action);
  latest.current = action;
  const run = useCallback(async (...args: A) => {
    await gate.current?.run(() => latest.current(...args));
  }, []);
  return { busy, run };
}

/** How a control that acts says what state it is in. */
export interface ActionState {
  /** Its action is in flight: busy, and a press does nothing. */
  busy?: boolean;
  /** It cannot act now (the answer is sent and locked, the recipe failed its checks, all are already chosen): a press does nothing. */
  unavailable?: boolean;
  /**
   * It is not ready (nothing chosen yet), but a press still reaches it, so the screen can say what is missing. Shown as
   * unavailable.
   */
  incomplete?: boolean;
}

/** The ARIA a control in that state carries: never `disabled`, so it keeps focus and stays in the Tab order. */
export function actionAttributes({ busy = false, unavailable = false, incomplete = false }: ActionState): { 'aria-disabled'?: true; 'aria-busy'?: true } {
  return {
    ...(busy || unavailable || incomplete ? { 'aria-disabled': true as const } : {}),
    ...(busy ? { 'aria-busy': true as const } : {}),
  };
}

/**
 * Refuses a press of a busy or unavailable control: its default is prevented, so a submit button does not submit its
 * form (Enter in a field of that form included) and a file input opens no picker. Returns whether it was refused.
 */
export function blockActivation(event: Pick<SyntheticEvent, 'preventDefault'>, { busy = false, unavailable = false }: ActionState): boolean {
  if (!busy && !unavailable) return false;
  event.preventDefault();
  return true;
}
