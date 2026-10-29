/** The in-memory spend book passes the same contract suite as the store's book over byway.sqlite (ADR-0095). */
import { spendBookContract } from '@byway/contracts/spend-book-suite';
import { describe, expect, it } from 'vitest';
import { MemorySpendBook } from '../src/memory-book.ts';

spendBookContract('in memory', () => {
  let t = Date.parse('2026-10-08T12:00:00.000Z');
  const book = new MemorySpendBook({ now: () => new Date(t) });
  return { a: book, b: book, advance: (ms) => void (t += ms), close: () => undefined };
});

// B-073 (3): a resumed call keeps no wait of its own, as migration 10's CHECK makes the store's book keep none (a wait goes
// with the reason 'waited' only). Nothing the in-memory book answers shows it, so its row is read.
describe('the in-memory book on its own', () => {
  it('a clip abandoned as waited, then resumed, keeps no wait', async () => {
    const book = new MemorySpendBook();
    const clip = (opId: string, owner: string) => ({ opId, owner, leaseMs: 60_000, operationKey: 'run-1/clip/video/abc/1', workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', kind: 'video' as const, provider: 'fal' as const, model: 'fal-ai/kling', reserveUsd: 0.5, paid: true, caps: { workspaceUsd: 100, runUsd: 50 } });
    await book.admit(clip('first', 'owner-a'));
    await book.markSent('first', 'owner-a');
    await book.accept('first', 'generation', 'req-gen');
    await book.abandon('first', 'waited', { minutes: 30, how: 'clip', cancel: 'no answer' });
    expect(await book.admit(clip('again', 'owner-b'))).toMatchObject({ resume: { opId: 'first' } });
    const row = (book as unknown as { rows: Map<string, { state: string; waited?: unknown }> }).rows.get('first');
    expect(row).toMatchObject({ state: 'accepted' });
    expect(row).not.toHaveProperty('waited');
  });
});
