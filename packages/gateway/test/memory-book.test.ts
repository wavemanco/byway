/** The in-memory spend book passes the same contract suite as the store's book over byway.sqlite (ADR-0095). */
import { spendBookContract } from '@byway/contracts/spend-book-suite';
import { MemorySpendBook } from '../src/memory-book.ts';

spendBookContract('in memory', () => {
  let t = Date.parse('2026-10-08T12:00:00.000Z');
  const book = new MemorySpendBook({ now: () => new Date(t) });
  return { a: book, b: book, advance: (ms) => void (t += ms), close: () => undefined };
});
