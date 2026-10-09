/**
 * The id the Recommendation screen's Start names its run with (F03 P3, ADR-0099 decision 7). The id stands for one
 * Start: it is sent again only while that Start got no answer (the network failed, or the answer was lost) and its
 * inputs are unchanged, so the server gives back the run it may have started. Once byway answered with a refusal (the
 * engine was down, the budget did not fit, the recipe changed), the Start is over and the next one has a new id; so
 * does a Start with other inputs. Before, one id lived as long as the screen: a press after "Restart byway, then try
 * again" got the failed run back and started nothing, and a changed budget or recipe got the earlier run.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/components/api.ts';
import { createStartIdentity, type StartInputs } from '../src/components/startIdentity.ts';

function minted() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

const inputs = (over: Partial<StartInputs['body']> = {}, composed: object | null = null): StartInputs => ({
  body: { intakeId: 'i1', budgetUsd: 2, recipeId: 'c4', ...over },
  composed,
});

/** Sends a Start whose answer is `outcome` (a value is a run; an error is thrown), and returns the id it named. */
async function send(identity: ReturnType<typeof createStartIdentity>, input: StartInputs, outcome: unknown): Promise<string> {
  let named = '';
  await identity
    .send(input, async (runId) => {
      named = runId;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    })
    .catch(() => undefined);
  return named;
}

const noAnswer = () => new ApiError('byway is not reachable. Check that it is still running, then try again.');
const refused = (status: number) => new ApiError('refused', undefined, undefined, undefined, {}, status);

describe('the id a Start names its run with (F03 P3)', () => {
  it('is sent again while no answer came back and nothing changed: the run it may have started comes back', async () => {
    const identity = createStartIdentity(minted());
    const first = await send(identity, inputs(), noAnswer());
    expect(await send(identity, inputs(), noAnswer())).toBe(first);
    expect(await send(identity, inputs(), { runId: first })).toBe(first);
  });

  it('is new after byway answered with a refusal, whatever it was: that Start is over', async () => {
    for (const status of [400, 409, 500, 503]) {
      const identity = createStartIdentity(minted());
      const first = await send(identity, inputs(), refused(status));
      const next = await send(identity, inputs(), noAnswer());
      expect(next, `after a ${status}`).not.toBe(first);
      // And that new Start is kept while it gets no answer.
      expect(await send(identity, inputs(), noAnswer())).toBe(next);
    }
  });

  it('is kept when byway answered "started" but the answer could not be read, or the send failed some other way', async () => {
    const identity = createStartIdentity(minted());
    const first = await send(identity, inputs(), new ApiError('byway sent an answer that could not be read. Try again.', undefined, undefined, undefined, undefined, 200));
    expect(await send(identity, inputs(), new TypeError('boom'))).toBe(first);
    expect(await send(identity, inputs(), noAnswer())).toBe(first);
  });

  it('is new for other inputs: a budget, a recipe, routes or examples', async () => {
    const identity = createStartIdentity(minted());
    const seen = new Set<string>();
    for (const over of [{}, { budgetUsd: 3 }, { recipeId: 'c1' }, { routes: { draft: 'c4-alt' } }, { refs: ['sha256:ab'] }]) seen.add(await send(identity, inputs(over), noAnswer()));
    expect(seen.size).toBe(5);
  });

  it('is new for a recipe composed again, even when it reads the same: the server holds the recipe, not the screen', async () => {
    const identity = createStartIdentity(minted());
    const view = { ok: true, diff: ['one'] };
    const first = await send(identity, inputs({ recipeId: 'composed' }, view), noAnswer());
    expect(await send(identity, inputs({ recipeId: 'composed' }, view), noAnswer())).toBe(first);
    expect(await send(identity, inputs({ recipeId: 'composed' }, { ...view }), noAnswer())).not.toBe(first);
  });

  it('mints lowercase UUIDs by default, as the server requires', async () => {
    const id = await send(createStartIdentity(), inputs(), noAnswer());
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
