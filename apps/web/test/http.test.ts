/**
 * The request boundary (ADR-0088): every JSON body a route accepts goes through parseBody, which refuses one that holds
 * a provider key byway has, before anything is stored or sent. Tested directly with Request objects (no server).
 */
import { describe, expect, it } from 'vitest';
import { findHeldKey } from '@byway/gateway';
import { parseBody } from '../src/server/http.ts';
import { HELD_KEY_REFUSAL } from '../src/view/refusals.ts';
import { ProblemInput, StartInput } from '../src/server/schemas.ts';
import { stringsIn } from '../src/services/strings-in.ts';

const ANTHROPIC = 'sk-ant-api03-test-not-a-real-key-000000';
const FAL_SECRET = '00112233445566778899aabbccddeeff';
const env = { ANTHROPIC_API_KEY: ANTHROPIC, FAL_KEY: `0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:${FAL_SECRET}` };
/** What the service host gives the routes, over a stand-in environment. */
const heldKeyIn = (value: unknown) => findHeldKey(env, stringsIn(value));

const post = (body: unknown, type = 'application/json') => new Request('http://127.0.0.1:3000/api/x', { method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const START = { intakeId: '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8', budgetUsd: 2 };

async function refused(result: Awaited<ReturnType<typeof parseBody>>): Promise<{ status: number; error: string }> {
  if (result.ok) throw new Error('expected a refusal');
  return { status: result.response.status, error: ((await result.response.json()) as { error: string }).error };
}

describe('parseBody refuses a body holding a held provider key', () => {
  it.each([
    ['the problem text', ProblemInput, { text: `Use my key ${ANTHROPIC} for this` }, 'ANTHROPIC_API_KEY'],
    ['an attachment', ProblemInput, { text: 'A memo', attachments: [{ name: 'notes', text: `config: ${FAL_SECRET}` }] }, 'FAL_KEY'],
    ['an attachment’s name', ProblemInput, { text: 'A memo', attachments: [{ name: ANTHROPIC, text: 'x' }] }, 'ANTHROPIC_API_KEY'],
    ['a property name of a record', StartInput, { ...START, routes: { [ANTHROPIC]: 'yes' } }, 'ANTHROPIC_API_KEY'],
  ] as const)('in %s: 400, naming the variable and never echoing the value', async (_where, schema, body, name) => {
    const { status, error } = await refused(await parseBody(post(body), schema, heldKeyIn));
    expect(status).toBe(400);
    expect(error).toContain(name);
    expect(error).not.toContain(ANTHROPIC);
    expect(error).not.toContain(FAL_SECRET);
  });

  it('marks the refusal as a held-key refusal, so Start can stop keeping the paste in the tab (ADR-0088)', async () => {
    const result = await parseBody(post({ text: `Use my key ${ANTHROPIC} for this` }), ProblemInput, heldKeyIn);
    if (result.ok) throw new Error('expected a refusal');
    expect(await result.response.json()).toMatchObject({ code: HELD_KEY_REFUSAL });
    // Other refusals carry no code.
    const other = await parseBody(post({ text: ' ' }), ProblemInput, heldKeyIn);
    if (other.ok) throw new Error('expected a refusal');
    expect(await other.response.json()).toEqual({ error: 'Describe what you are working on.' });
  });

  it.each([
    ['the problem text only', { text: `Use my key ${ANTHROPIC} for this`, attachments: [{ name: 'notes', text: 'Spring classes' }] }, ['text']],
    ['an attachment only', { text: 'A memo', attachments: [{ name: 'notes', text: `config: ${FAL_SECRET}` }] }, ['attachments']],
    ['both', { text: `Use ${ANTHROPIC}`, attachments: [{ name: ANTHROPIC, text: 'x' }] }, ['text', 'attachments']],
  ] as const)('names the top-level fields that held a key (%s), so Start stops keeping only those (ADR-0088)', async (_where, body, fields) => {
    const result = await parseBody(post(body), ProblemInput, heldKeyIn);
    if (result.ok) throw new Error('expected a refusal');
    const answer = (await result.response.json()) as { fields?: unknown };
    expect(answer).toMatchObject({ code: HELD_KEY_REFUSAL, fields });
    expect(JSON.stringify(answer)).not.toContain(ANTHROPIC);
    expect(JSON.stringify(answer)).not.toContain(FAL_SECRET);
  });

  // The refusal used to say "This text contains your …" wherever the key was, an attachment included, though it names
  // the fields: it now says where, in the words Start uses for those parts.
  it.each([
    ['the problem text', { text: `Use my key ${ANTHROPIC} for this` }, 'This text contains your ANTHROPIC_API_KEY. Remove it and try again'],
    ['an attachment', { text: 'A memo', attachments: [{ name: 'notes', text: `config: ${ANTHROPIC}` }] }, 'An attachment contains your ANTHROPIC_API_KEY. Remove it and try again'],
    ['both, the same key', { text: `Use ${ANTHROPIC}`, attachments: [{ name: 'notes', text: ANTHROPIC }] }, 'This text and an attachment contain your ANTHROPIC_API_KEY. Remove it and try again'],
    [
      'both, two keys',
      { text: `Use ${ANTHROPIC}`, attachments: [{ name: 'notes', text: `config: ${FAL_SECRET}` }] },
      'This text contains your ANTHROPIC_API_KEY, and an attachment contains your FAL_KEY. Remove them and try again',
    ],
  ] as const)('says where the key was: %s', async (_where, body, start) => {
    const { error } = await refused(await parseBody(post(body), ProblemInput, heldKeyIn));
    expect(error.startsWith(start), error).toBe(true);
    expect(error).toMatch(/byway never stores or sends its keys\.$/);
  });

  it('names a part it has no word for as the request, and says which key, so a screen can word it itself', async () => {
    const result = await parseBody(post({ ...START, routes: { [ANTHROPIC]: 'yes' } }), StartInput, heldKeyIn);
    if (result.ok) throw new Error('expected a refusal');
    const answer = (await result.response.json()) as { error: string; key?: unknown };
    expect(answer.error.startsWith('This request contains your ANTHROPIC_API_KEY. Remove it and try again')).toBe(true);
    // The variable's name, as the message already says it; never its value.
    expect(answer.key).toBe('ANTHROPIC_API_KEY');
  });

  it('accepts text that only looks like a key, and returns the parsed body', async () => {
    const body = { text: 'The fixture uses sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX as a placeholder.' };
    expect(await parseBody(post(body), ProblemInput, heldKeyIn)).toEqual({ ok: true, data: body });
  });

  it('checks what the schema keeps: fields it strips are never stored, and a body it rejects keeps its own message', async () => {
    expect(await parseBody(post({ text: 'A memo', extra: ANTHROPIC }), ProblemInput, heldKeyIn)).toEqual({ ok: true, data: { text: 'A memo' } });
    expect(await refused(await parseBody(post({ text: ' ', attachments: [{ name: 'n', text: ANTHROPIC }] }), ProblemInput, heldKeyIn))).toEqual({ status: 400, error: 'Describe what you are working on.' });
  });

  it('still refuses anything but JSON first', async () => {
    expect((await refused(await parseBody(post('text=x', 'application/x-www-form-urlencoded'), ProblemInput, heldKeyIn))).status).toBe(415);
  });
});

describe('stringsIn', () => {
  it('walks every string of a JSON value, property names included', () => {
    expect([...stringsIn({ a: ['b', { c: 'd', e: 1, f: null }], g: true })].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect([...stringsIn('plain')]).toEqual(['plain']);
    expect([...stringsIn(42)]).toEqual([]);
  });
});
