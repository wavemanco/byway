/**
 * Saving a wait in Settings' "How long to wait for an answer" (WEB-2 of block 2's check): each change saves at once, and
 * a keyboard user stepping a select from 15 to 60 changes it three times. A row's saves go one after another, and only
 * its newest choice is sent once the save under way has its answer, so the server keeps them in the order they were
 * made; the row and its announcement end on what the server kept, and a failed save goes back to what the server last
 * kept. The server here is a stand-in for PATCH /api/waits whose answers the test gives, one at a time.
 */
import type { AnswerWait } from '@byway/contracts';
import { describe, expect, it } from 'vitest';
import { waitSaves, type WaitChoice, type WaitShown } from '../src/components/waitSaves.ts';
import type { AnswerWaitRow } from '../src/view/waits.ts';

const row = (model: string, minutes = 15, chosen = false): AnswerWaitRow => ({ provider: 'anthropic', model, kind: 'text', choices: [15, 30, 45, 60], defaultMinutes: 15, minutes, chosen });

const UNREACHABLE = 'byway is not reachable. Check that it is still running, then try again.';

/** The stand-in server: every save waits until the test answers it (the server kept it) or fails it. */
function stubServer() {
  const sent: { choice: WaitChoice; answer(): void; fail(message: string): void }[] = [];
  const save = (choice: WaitChoice) =>
    new Promise<AnswerWait>((resolve, reject) => {
      sent.push({ choice, answer: () => resolve({ ...choice, changedAt: '2026-10-23T00:00:00.000Z' }), fail: (message) => reject(new Error(message)) });
    });
  return { sent, save };
}

/** What the section shows: each row's minutes, the live region's words and the alert's. */
function stubScreen() {
  const rows = new Map<string, WaitShown>();
  const seen = { said: null as string | null, error: null as string | null };
  return {
    rows,
    seen,
    show: (provider: string, model: string, shown: WaitShown) => void rows.set(`${provider}/${model}`, shown),
    said: (words: string | null) => void (seen.said = words),
    failed: (words: string | null) => void (seen.error = words),
  };
}

function setUp() {
  const server = stubServer();
  const screen = stubScreen();
  const save = waitSaves({ save: server.save, show: screen.show, said: screen.said, failed: screen.failed });
  // As the select calls it: with its row as the section shows it now.
  const choose = (base: AnswerWaitRow, minutes: number) => save({ ...base, ...screen.rows.get(`${base.provider}/${base.model}`) }, minutes);
  return { server, screen, choose };
}

/** Lets every answer given so far reach the section. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('saving a wait', () => {
  it('sends a row’s next choice only once the save under way has its answer, and only the newest, so the row and its announcement end on what the server kept', async () => {
    const { server, screen, choose } = setUp();
    const opus = row('claude-opus-5-5');
    // Three steps of the arrow key: 30, 45, 60.
    const first = choose(opus, 30);
    void choose(opus, 45);
    void choose(opus, 60);
    expect(screen.rows.get('anthropic/claude-opus-5-5')).toEqual({ minutes: 60, chosen: true });
    expect(server.sent.map((s) => s.choice.minutes)).toEqual([30]);

    // The answer to 30 comes: 60 is sent next, and 45 never is. 30 is neither shown nor said.
    server.sent[0]?.answer();
    await settle();
    expect(server.sent.map((s) => s.choice)).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5', minutes: 30 },
      { provider: 'anthropic', model: 'claude-opus-5-5', minutes: 60 },
    ]);
    expect(screen.rows.get('anthropic/claude-opus-5-5')).toEqual({ minutes: 60, chosen: true });
    expect(screen.seen.said).toBeNull();

    server.sent[1]?.answer();
    await first;
    expect(screen.rows.get('anthropic/claude-opus-5-5')).toEqual({ minutes: 60, chosen: true });
    expect(screen.seen).toEqual({ said: 'claude-opus-5-5 now waits 60 minutes, from its next call.', error: null });
    expect(server.sent).toHaveLength(2);
  });

  it('passes over a save that fails while a newer choice waits: the newer one is sent, and decides what the row shows', async () => {
    const { server, screen, choose } = setUp();
    const sonnet = row('claude-sonnet-5-5');
    const first = choose(sonnet, 30);
    void choose(sonnet, 45);
    server.sent[0]?.fail(UNREACHABLE);
    await settle();
    expect(screen.seen.error).toBeNull();
    expect(server.sent.map((s) => s.choice.minutes)).toEqual([30, 45]);
    server.sent[1]?.answer();
    await first;
    expect(screen.rows.get('anthropic/claude-sonnet-5-5')).toEqual({ minutes: 45, chosen: true });
    expect(screen.seen).toEqual({ said: 'claude-sonnet-5-5 now waits 45 minutes, from its next call.', error: null });
  });

  it('when the newest save fails, goes back to what the server last kept, not to what the row showed when that change began', async () => {
    const { server, screen, choose } = setUp();
    const fable = row('claude-fable-5-1');
    // Never chosen, so it waits the default, 15. Both steps fail: the server still keeps no choice.
    const first = choose(fable, 30);
    void choose(fable, 45);
    server.sent[0]?.fail(UNREACHABLE);
    await settle();
    server.sent[1]?.fail(UNREACHABLE);
    await first;
    expect(screen.rows.get('anthropic/claude-fable-5-1')).toEqual({ minutes: 15, chosen: false });
    expect(screen.seen).toEqual({ said: null, error: UNREACHABLE });

    // A save the server kept is what a later failure goes back to.
    const kept = choose(fable, 30);
    expect(screen.seen.error).toBeNull();
    server.sent[2]?.answer();
    await kept;
    const failed = choose(fable, 60);
    server.sent[3]?.fail('The request failed (500). Try again.');
    await failed;
    expect(screen.rows.get('anthropic/claude-fable-5-1')).toEqual({ minutes: 30, chosen: true });
    expect(screen.seen).toEqual({ said: null, error: 'The request failed (500). Try again.' });

    // So is one kept while a newer choice waited: 45 is kept, then 60, sent after it, fails.
    const steps = choose(fable, 45);
    void choose(fable, 60);
    server.sent[4]?.answer();
    await settle();
    expect(server.sent.slice(4).map((s) => s.choice.minutes)).toEqual([45, 60]);
    server.sent[5]?.fail(UNREACHABLE);
    await steps;
    expect(screen.rows.get('anthropic/claude-fable-5-1')).toEqual({ minutes: 45, chosen: true });
    expect(screen.seen).toEqual({ said: null, error: UNREACHABLE });
  });

  it('saves each row on its own: a save under way on one model does not hold another’s', async () => {
    const { server, screen, choose } = setUp();
    const a = choose(row('claude-opus-5-5', 45, true), 60);
    const b = choose(row('claude-sonnet-5-5'), 30);
    expect(server.sent.map((s) => `${s.choice.model} ${s.choice.minutes}`)).toEqual(['claude-opus-5-5 60', 'claude-sonnet-5-5 30']);
    server.sent[1]?.answer();
    await b;
    expect(screen.seen.said).toBe('claude-sonnet-5-5 now waits 30 minutes, from its next call.');
    server.sent[0]?.answer();
    await a;
    expect(screen.seen.said).toBe('claude-opus-5-5 now waits 60 minutes, from its next call.');
    expect([...screen.rows]).toEqual([
      ['anthropic/claude-opus-5-5', { minutes: 60, chosen: true }],
      ['anthropic/claude-sonnet-5-5', { minutes: 30, chosen: true }],
    ]);
  });
});
