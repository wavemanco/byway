/**
 * The conversation record's extractor (scripts/extract-conversation.cjs; AGENTS.md, "The conversation record"), run on a
 * small transcript of its own: the owner's typed messages come out whole, an image they pasted marked as "[image]"
 * (BUILD-3: a message with an image was dropped without a word), and an answer to a question beside the question asked.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(path.join(tmpdir(), 'byway-extract-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const human = (timestamp: string, content: unknown) => ({ type: 'user', timestamp, origin: { kind: 'human' }, message: { role: 'user', content } });
const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } };
const questions = [{ question: 'Which?', options: [{ label: 'A' }, { label: 'B' }] }];
const transcript = [
  human('2026-10-08T00:00:01.000Z', 'a string message'),
  human('2026-10-08T00:00:02.000Z', [{ type: 'text', text: 'all text,' }, { type: 'text', text: 'two parts' }]),
  human('2026-10-08T00:00:03.000Z', [{ type: 'text', text: 'look at this' }, image]),
  { type: 'assistant', timestamp: '2026-10-08T00:00:04.000Z', message: { content: [{ type: 'tool_use', id: 'ask1', name: 'AskUserQuestion', input: { questions } }] } },
  { type: 'user', timestamp: '2026-10-08T00:00:05.000Z', message: { content: [{ type: 'tool_result', tool_use_id: 'ask1', content: 'A' }] } },
  { type: 'attachment', timestamp: '2026-10-08T00:00:06.000Z', attachment: { type: 'queued_command', origin: { kind: 'human' }, prompt: [{ type: 'text', text: 'queued' }, image] } },
  // Before the record's cut, already in conversation.md.
  human('2026-10-07T17:00:00.000Z', 'too early'),
];

function extract(): { out: string; err: string } {
  const src = path.join(dir, 'session.jsonl');
  const out = path.join(dir, 'out.md');
  writeFileSync(src, transcript.map((r) => JSON.stringify(r)).join('\n'));
  const run = spawnSync(process.execPath, [path.resolve('scripts/extract-conversation.cjs'), src, out], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  return { out: readFileSync(out, 'utf8'), err: run.stderr };
}

describe('the conversation extractor', () => {
  const { out, err } = extract();

  it('writes every typed message, in order, with its local and UTC times', () => {
    expect(out).toContain('## USER 2026-10-07T17:00:01.000-07:00 (2026-10-08T00:00:01.000Z)\na string message\n');
    expect(out).toContain('## USER 2026-10-07T17:00:02.000-07:00 (2026-10-08T00:00:02.000Z)\nall text,\ntwo parts\n');
    expect(out).not.toContain('too early');
    expect(err).toContain('entries 6 users 4 asks 1');
  });

  it('keeps a message that carries an image, the image marked where it was (BUILD-3)', () => {
    expect(out).toContain('## USER 2026-10-07T17:00:03.000-07:00 (2026-10-08T00:00:03.000Z)\nlook at this\n[image]\n');
    expect(out).toContain('(2026-10-08T00:00:06.000Z)\nqueued\n[image]\n');
  });

  it('writes an answer after the question asked, as the app recorded it', () => {
    expect(out).toContain(`## CLAUDE-ASKS 2026-10-07T17:00:04.000-07:00 (2026-10-08T00:00:04.000Z)\n${JSON.stringify(questions)}\n`);
    expect(out).toContain('## USER 2026-10-07T17:00:05.000-07:00 (2026-10-08T00:00:05.000Z)\n[ANSWER] A\n');
  });
});
