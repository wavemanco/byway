/**
 * @byway/recipe's `promptShows` (ADR-0097) is what the runner puts before the model, written down. Admission reads it for
 * whether a model step takes a port in: a step whose template never shows a port it consumes or reads does not apply,
 * decide by or carry on what that port holds. So it is held here to the activities themselves (buildPrompt and what
 * modelStep, assetStep and relayLink add or override): every catalog prompt, in the role the catalog uses it for, on
 * every medium the library has a template for, takes in every port at once, each holding a value of its own, and the
 * request the gateway receives shows exactly the ports `promptShows` says it does, as text or as an attached image.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CompletionRequest, Gateway, Medium, ProfileStatus } from '@byway/contracts';
import { PROFILES } from '@byway/gateway';
import { CATALOG } from '@byway/catalog';
import { MEDIA, type PortType } from '@byway/protocol';
import { createPromptRenderer } from '@byway/prompts';
import { audioAsset, JUDGING_ROLES as SHOWN_NO_WORK, promptShows, ROLES, steps, type Role } from '@byway/recipe';
import { assetStep } from '../src/activities/asset.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { JUDGING_ROLES } from '../src/activities/prompting.ts';
import { relayLink } from '../src/activities/relay.ts';
import type { Ports, RunRef, StepSpec, ViewRef } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

const library = createPromptRenderer();
const DEMO = PROFILES.find((p) => p.id === 'demo')!;
const media: ProfileStatus = { profile: DEMO, usable: true, missing: [], images: true, video: true, otherFamily: false };

/** Stops an activity at its first model call, once the request is captured. */
class Captured extends Error {}

/** A gateway that keeps the first completion request and stops the step there. */
function capturing(into: CompletionRequest[]): Gateway {
  const stop = async (): Promise<never> => {
    throw new Captured('captured');
  };
  return {
    demo: false,
    async complete(req) {
      into.push(req);
      throw new Captured('captured');
    },
    image: stop,
    video: stop,
    spend: async (id) => ({ workspaceId: id, spentUsd: 0, capUsd: 100, byRun: {} }),
    providers: () => [],
    profiles: () => [],
    profileStatus: () => [media],
    verifyLedger: async () => null,
    spendRecords: async () => ({ inFlight: [], uncertain: [], faults: [], notInAuditFile: 0, setAside: [] }),
    auditLedger: async () => ({ brokenAt: null, missing: [], pending: 0, setAside: [], openFaults: 0 }),
    close: async () => undefined,
  };
}

/** A work of each medium in the format its activities read, holding `mark` where its text view shows it. */
const workText = (medium: Medium, mark: string): string =>
  ({
    prose: `# Memo\n\n${mark}\n`,
    'web-page': `<!doctype html><title>t</title><p>${mark}</p>`,
    options: JSON.stringify({ options: [{ title: mark, pitch: 'p', rationale: 'r' }] }),
    media: JSON.stringify({ storyboard: [{ shot: 1, description: mark, imagePrompt: 'p', durationSec: 3 }], voiceover: 'v' }),
    'code-diff': `diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+${mark}\n\nWhy: w\n`,
  })[medium];

/**
 * A view as the render activity makes it on each medium: a web page's screenshots, a storyboard's text and its frames,
 * and the text alone on the media read as text.
 */
async function viewOf(medium: Medium, mark: string, image: string): Promise<ViewRef> {
  if (medium === 'web-page') return { imageArtifactIds: [image] };
  const textArtifactId = (await store.artifacts.putText(mark, 'text/plain')).id;
  return { textArtifactId, imageArtifactIds: medium === 'media' ? [image] : [] };
}

/** Every port a value of its own can be followed through into a prompt. */
const PORTS: PortType[] = ['intent', 'brief', 'artifact', 'view', 'option_set<artifact>', 'critique', 'taste', 'voice', 'tells', 'seed', 'anchor', 'asset'];

let dir: string;
let store: MemoStore;
let workspaceId: string;
const images: Record<'view' | 'option' | 'anchor' | 'asset', string> = { view: '', option: '', anchor: '', asset: '' };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-prompt-shows-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
  let n = 0;
  for (const k of Object.keys(images) as (keyof typeof images)[]) images[k] = (await store.artifacts.put(new Uint8Array([137, 80, 78, 71, 40, ++n]), 'image/png')).id;
});
afterAll(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Run the step's activity, as the interpreter dispatches it, on ports that each hold a value of their own; the request it sent. */
async function requestFor(step: StepSpec, medium: Medium): Promise<CompletionRequest> {
  const runId = `run-${Math.random().toString(36).slice(2)}`;
  await store.createRun({ id: runId, workspaceId, recipeId: 'shows', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'MARK-intent', medium, budgetUsd: 5 });
  await store.updateRun(runId, { status: 'running' });
  const run: RunRef = { runId, workspaceId, recipeId: 'shows', profileId: 'demo', medium, problemId: await storeBrief(store.artifacts, { text: 'MARK-intent' }), seeds: [] };
  const text = async (t: string, type = 'text/markdown') => (await store.artifacts.putText(t, type)).id;
  const ports: Ports = {
    artifact: await text(workText(medium, 'MARK-artifact')),
    brief: 'MARK-brief',
    critique: 'MARK-critique',
    taste: 'MARK-taste',
    voice: 'MARK-voice',
    view: { pool: false, items: [await viewOf(medium, 'MARK-view', images.view)] },
    options: [await text(workText(medium, 'MARK-options'))],
    optionViews: [await viewOf(medium, 'MARK-option-view', images.option)],
    anchor: images.anchor,
    asset: [images.asset],
  };
  const requests: CompletionRequest[] = [];
  const deps: RunnerDeps = { gateway: capturing(requests), store, prompts: library, seed: () => 'MARK-seed' };
  const call = { key: `${runId}/${step.id}/-/1`, stepId: step.id, stage: 'D2' as const };
  try {
    if (step.role === 'asset') await assetStep(deps, { run, call, step, ports });
    else if (step.role === 'relay') await relayLink(deps, { run, call, step, ports, shot: 1 });
    else await modelStep(deps, { run, call, step, ports, refs: [], tells: 'MARK-tells' });
  } catch (e) {
    if (!(e instanceof Captured)) throw e;
  }
  expect(requests, `${step.prompt} on ${medium} sent no request`).toHaveLength(1);
  return requests[0]!;
}

/** Whether the request shows what the port held: its text, or its image. */
function shows(req: CompletionRequest, port: PortType): boolean {
  const parts = req.messages.flatMap((m) => m.content);
  const text = [req.system ?? '', ...parts.flatMap((p) => (p.type === 'text' ? [p.text] : []))].join('\n');
  const attached = new Set(parts.flatMap((p) => (p.type === 'image' ? [p.artifactId] : [])));
  switch (port) {
    case 'intent':
      return text.includes('MARK-intent');
    case 'view':
      return text.includes('MARK-view') || attached.has(images.view);
    case 'option_set<artifact>':
      return text.includes('MARK-options') || attached.has(images.option);
    case 'anchor':
      return attached.has(images.anchor);
    case 'asset':
      return attached.has(images.asset);
    default:
      return text.includes(`MARK-${port}`);
  }
}

/** Every library prompt a catalog model step names, with the roles the catalog uses it for. */
const rolesByPrompt = new Map<string, Set<Role>>();
for (const r of CATALOG) for (const { step } of steps(r)) if (step.actor === 'model' && step.prompt && library.has(step.prompt)) (rolesByPrompt.get(step.prompt) ?? rolesByPrompt.set(step.prompt, new Set()).get(step.prompt)!).add(step.role);
const hasTemplate = (id: string, medium: Medium): boolean => {
  try {
    library.info(id, medium);
    return true;
  } catch {
    return false;
  }
};
/**
 * The cases: each such prompt in each of its roles on each medium it has a template for; a relay link only on media (it
 * runs on a storyboard). An ASSET step whose prompt the library does not hold asks the image-briefs helper.
 */
const cases: (readonly [string, string, Role, Medium])[] = [...rolesByPrompt].flatMap(([prompt, roles]) =>
  [...roles].flatMap((role) => MEDIA.filter((m) => hasTemplate(prompt, m) && (role !== 'relay' || m === 'media')).map((m) => [`${prompt} as ${role} on ${m}`, prompt, role, m] as const)),
);
cases.push(...MEDIA.filter((m) => hasTemplate('helper.asset.briefs', m)).map((m) => [`an ASSET step with no library prompt on ${m}`, 'no.such.prompt', 'asset' as Role, m] as const));

describe('what a model step’s prompt shows, as the activities render it (promptShows)', () => {
  it('never gives the work to the roles buildPrompt never gives it to (port rule 1), including those no catalog prompt is written for', () => {
    expect(new Set(ROLES.filter((r) => SHOWN_NO_WORK.has(r)))).toEqual(new Set(ROLES.filter((r) => JUDGING_ROLES.has(r))));
  });

  it('covers every catalog prompt the library holds', () => {
    expect(rolesByPrompt.size).toBeGreaterThanOrEqual(70);
    expect(cases.length).toBeGreaterThan(rolesByPrompt.size);
  });

  it.each(cases)('%s', async (_name, prompt, role, medium) => {
    // An ASSET that consumes the voice turns the script into audio, which has no executor and makes no call (ADR-0069):
    // here it reads the voice instead, which fills the same slot (ADR-0089), so its template still renders.
    const reads: PortType[] = role === 'asset' ? ['voice'] : [];
    const consumes = PORTS.filter((p) => !reads.includes(p));
    const step: StepSpec = { id: `s-${role}`, role, actor: 'model', tier: 'mid', prompt, consumes, reads, produces: role === 'relay' ? ['artifact', 'anchor'] : ['artifact'] };
    expect(audioAsset(step)).toBe(false);
    const req = await requestFor(step, medium);
    const seen = Object.fromEntries(PORTS.map((p) => [p, shows(req, p)]));
    const said = Object.fromEntries(PORTS.map((p) => [p, promptShows(step, p, medium)]));
    expect(said).toEqual(seen);
  });
});
