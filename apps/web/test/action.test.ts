/**
 * The shared action primitive (R5, useAction.ts): the synchronous in-flight guard, and how a busy or unavailable control
 * is marked and refuses a press. Rendered to HTML (react-dom/server, no browser) for the markup; what keyboard focus
 * does runs in e2e/keyboard.spec.ts.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionButton } from '../src/components/ActionButton.tsx';
import { actionAttributes, blockActivation, createInFlight } from '../src/components/useAction.ts';

/** A promise and the function that settles it, for an action that finishes when the test says. */
function later<T = void>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('the in-flight guard', () => {
  it('refuses a second start while the first runs, in the same tick, before any re-render', async () => {
    const changes: boolean[] = [];
    const gate = createInFlight((busy) => changes.push(busy));
    const done = later();
    let calls = 0;
    const action = async () => {
      calls++;
      await done.promise;
    };
    const first = gate.run(action);
    // A double press: the second arrives before the first's promise has settled or React has run.
    const second = gate.run(action);
    expect(await second).toBe(false);
    expect(calls).toBe(1);
    expect(gate.running).toBe(true);
    done.resolve();
    expect(await first).toBe(true);
    expect(gate.running).toBe(false);
    expect(changes).toEqual([true, false]);
    // Free again: the next press runs.
    expect(await gate.run(action)).toBe(true);
    expect(calls).toBe(2);
  });

  it('is released when the action fails, and the error is thrown on', async () => {
    const gate = createInFlight();
    await expect(gate.run(async () => Promise.reject(new Error('refused')))).rejects.toThrow('refused');
    expect(gate.running).toBe(false);
  });

  it('stays busy after an action that holds it (one that leaves the screen on success)', async () => {
    const changes: boolean[] = [];
    const gate = createInFlight((busy) => changes.push(busy));
    expect(await gate.run(async () => 'hold' as const)).toBe(true);
    expect(gate.running).toBe(true);
    expect(await gate.run(() => undefined)).toBe(false);
    expect(changes).toEqual([true]);
  });
});

describe('a control that acts', () => {
  it('is marked unavailable with aria-disabled, and busy with aria-busy, never with disabled', () => {
    expect(actionAttributes({})).toEqual({});
    expect(actionAttributes({ busy: true })).toEqual({ 'aria-disabled': true, 'aria-busy': true });
    expect(actionAttributes({ unavailable: true })).toEqual({ 'aria-disabled': true });
    expect(actionAttributes({ incomplete: true })).toEqual({ 'aria-disabled': true });
  });

  it('refuses a press while busy or unavailable by preventing its default (a submit, a file picker), and lets an incomplete one through', () => {
    const press = () => {
      const event = { prevented: false, preventDefault() {
        this.prevented = true;
      } };
      return event;
    };
    for (const state of [{ busy: true }, { unavailable: true }]) {
      const event = press();
      expect(blockActivation(event, state)).toBe(true);
      expect(event.prevented).toBe(true);
    }
    for (const state of [{}, { incomplete: true }]) {
      const event = press();
      expect(blockActivation(event, state)).toBe(false);
      expect(event.prevented).toBe(false);
    }
  });

  it('renders as a focusable button: aria-disabled and aria-busy, no disabled attribute, type button unless set', () => {
    const html = (props: Parameters<typeof ActionButton>[0]) => renderToStaticMarkup(createElement(ActionButton, props, 'Send'));
    expect(html({})).toBe('<button type="button">Send</button>');
    expect(html({ busy: true, className: 'button' })).toBe('<button class="button" type="button" aria-disabled="true" aria-busy="true">Send</button>');
    expect(html({ unavailable: true, type: 'submit' })).toBe('<button type="submit" aria-disabled="true">Send</button>');
    expect(html({ incomplete: true })).toBe('<button type="button" aria-disabled="true">Send</button>');
    for (const props of [{ busy: true }, { unavailable: true }, { incomplete: true }]) expect(html(props)).not.toMatch(/\sdisabled/);
  });
});
