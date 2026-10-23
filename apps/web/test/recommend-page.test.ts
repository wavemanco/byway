/**
 * The Recommendation page's render (app/recommend/[intakeId]/page.tsx) is a read: it shows the recommendation stored on
 * the intake and asks the model for nothing. Before, a render made the first recommendation while none was stored, so
 * the page could not be rendered again freely (router.refresh() was avoided there, and only two counts in
 * e2e/recovery.spec.ts guarded it). Now the screen asks for the first one itself once it is shown (POST /recommend
 * { ensure: true }; api.test.ts). The page runs here against the real services, with getDeps swapped for them.
 */
import { isValidElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Recommendation } from '@byway/contracts';
import { createIntake, currentRecommendation, type Deps } from '../src/server/api.ts';
import type { Services } from '../src/services/index.ts';
import { testHost, type TestHost } from './fixtures/services.ts';

const swapped = vi.hoisted(() => ({ deps: undefined as Deps | undefined }));
vi.mock('../src/server/deps.ts', () => ({
  getDeps: async () => {
    if (!swapped.deps) throw new Error('no test deps');
    return swapped.deps;
  },
}));

const { default: RecommendPage } = await import('../app/recommend/[intakeId]/page.tsx');

let current: TestHost | undefined;

afterEach(async () => {
  await current?.dispose();
  current = undefined;
  swapped.deps = undefined;
});

async function deps(): Promise<Deps> {
  current = testHost();
  const { host } = current;
  const services: Services = host.services(true);
  const ws = await services.store.ensureDefaultWorkspace();
  swapped.deps = { services, workspaceId: ws.id, profileId: 'demo', heldKeyIn: host.heldKeyIn, questionEstimates: host.questionEstimates, pricesCheckedOn: host.pricesCheckedOn };
  return swapped.deps;
}

/** The page's render for this intake (and library recipe), and the recommendation it hands the screen. */
async function rendered(intakeId: string, recipe?: string): Promise<Recommendation | null | undefined> {
  const page = (await RecommendPage({ params: Promise.resolve({ intakeId }), searchParams: Promise.resolve(recipe ? { recipe } : {}) } as never)) as ReactElement<{ children: ReactElement<{ recommendation?: Recommendation | null }> }>;
  const view = page.props.children;
  if (!isValidElement(view)) throw new Error('the page rendered no screen');
  return view.props.recommendation;
}

/** Real services on a temp data directory: as many tests here as in api.test.ts, and as busy a disk. */
const PRODUCT_PATH = { timeout: 30_000 };

describe('the Recommendation page renders what is stored and asks the model nothing (F03)', PRODUCT_PATH, () => {
  it('with no recommendation stored yet, renders none, and none is made', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    const compose = vi.spyOn(d.services.advisor, 'compose');
    expect(await rendered(intakeId)).toBeNull();
    expect(await rendered(intakeId)).toBeNull();
    expect(recommend).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
    expect((await d.services.store.getIntake(intakeId))?.recommendation).toBeUndefined();
  });

  it('once one is stored, renders it, however often it is rendered', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    const stored = await currentRecommendation(d, intakeId);
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    expect(await rendered(intakeId)).toEqual(stored);
    expect(await rendered(intakeId)).toEqual(stored);
    expect(recommend).not.toHaveBeenCalled();
  });

  it('for a recipe chosen from the library, renders no recommendation and makes none', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    expect(await rendered(intakeId, 'c4')).toBeNull();
    expect(recommend).not.toHaveBeenCalled();
  });
});
