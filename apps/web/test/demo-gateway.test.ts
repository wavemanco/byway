import { describe, expect, it } from 'vitest';
import { GatewayError } from '@byway/contracts';
import { createDemoGateway } from '../src/services/demo/gateway.ts';
import { createDemoStore } from '../src/services/demo/store.ts';

async function setup() {
  const store = createDemoStore();
  const ws = await store.ensureDefaultWorkspace();
  return { store, ws, gateway: createDemoGateway({ store }) };
}

describe('demo gateway', () => {
  it('reports providers as configured or not, and never exposes a key', async () => {
    const { gateway } = await setup();
    const providers = gateway.providers();
    expect(providers.map((p) => p.provider).sort()).toEqual(['anthropic', 'fal', 'google', 'mock', 'openai', 'openrouter']);
    expect(providers.find((p) => p.provider === 'mock')?.configured).toBe(true);
    for (const p of providers) expect(Object.keys(p).sort()).toEqual(['configured', 'provider']);
  });

  it('offers only the demo profile as usable, since no key is set', async () => {
    const { gateway } = await setup();
    expect(gateway.profiles().map((p) => p.id)).toEqual(['demo']);
  });

  it('reports every profile with what it is missing, including whether it can make video clips', async () => {
    const { gateway } = await setup();
    const status = gateway.profileStatus();
    expect(status.map((s) => s.profile.id)).toEqual(['balanced', 'best', 'demo']);
    const balanced = status.find((s) => s.profile.id === 'balanced');
    expect(balanced).toMatchObject({ usable: false, missing: ['anthropic'], images: false, video: false });
    expect(status.find((s) => s.profile.id === 'demo')).toMatchObject({ usable: true, missing: [], images: true, video: true });
  });

  it('answers by purpose with the output contracts of spec §3.3, at no cost', async () => {
    const { gateway, ws } = await setup();
    const ask = (purpose: string) =>
      gateway.complete({ workspaceId: ws.id, purpose, tier: 'big', profileId: 'demo', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
    expect((await ask('critic:prose')).text).toMatch(/Score: \d+\/10$/);
    expect((await ask('judge:web-page')).text).toMatch(/Choice: [A-Z]$/);
    expect((await ask('check:web-page')).text).toBe('No defects.');
    expect((await ask('build:web-page')).text).toMatch(/^```html\n<!doctype html>/i);
    expect(JSON.parse(/```json\n([\s\S]*)\n```/.exec((await ask('relay:media')).text)?.[1] ?? '{}')).toMatchObject({ clipPrompt: expect.any(String), durationSec: expect.any(Number) });
    const result = await ask('tells-compare:prose');
    expect(result.text).toMatch(/Keep: [AB]$/);
    expect(result).toMatchObject({ provider: 'mock', costUsd: 0, stopReason: 'end' });
  });

  it('stores generated images in the artifact store as PNG', async () => {
    const { gateway, store, ws } = await setup();
    const image = await gateway.image({ workspaceId: ws.id, purpose: 'asset:web-page', profileId: 'demo', prompt: 'clay', size: '1024x1024' });
    expect(image.mediaType).toBe('image/png');
    const { bytes } = await store.artifacts.get(image.artifactId);
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('makes a labelled placeholder clip (an animated SVG) and a PNG last frame for a relay link', async () => {
    const { gateway, store, ws } = await setup();
    const frame = await store.artifacts.putText('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml');
    const clip = await gateway.video({
      workspaceId: ws.id,
      runId: 'run-1',
      stepId: 'relay',
      purpose: 'relay:media',
      profileId: 'balanced',
      prompt: 'Hands open the <box>',
      startFrameArtifactId: frame.id,
      durationSec: 3,
    });
    expect(clip).toMatchObject({ provider: 'mock', costUsd: 0 });
    const svg = await store.artifacts.get(clip.artifactId);
    expect(svg.record.mediaType).toBe('image/svg+xml');
    const text = new TextDecoder().decode(svg.bytes);
    expect(text).toContain('Placeholder clip');
    expect(text).toContain('Hands open the &lt;box&gt;');
    expect(text).not.toContain('<script');
    expect(text).toMatch(/prefers-reduced-motion/);
    const last = await store.artifacts.get(clip.lastFrameArtifactId);
    expect(last.record.mediaType).toBe('image/png');
    expect(await gateway.verifyLedger()).toBeNull();
  });

  it('refuses a video request without a duration or with an unknown profile', async () => {
    const { gateway, ws } = await setup();
    const base = { workspaceId: ws.id, purpose: 'relay:media', profileId: 'demo', prompt: 'x', durationSec: 3 };
    await expect(gateway.video({ ...base, durationSec: 0 })).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(gateway.video({ ...base, profileId: 'nope' })).rejects.toMatchObject({ code: 'unknown-profile' });
  });

  it('keeps a hash-chained ledger it can verify', async () => {
    const { gateway, ws } = await setup();
    for (const purpose of ['critic:prose', 'build:prose']) {
      await gateway.complete({ workspaceId: ws.id, purpose, tier: 'mid', profileId: 'demo', messages: [] });
    }
    expect(await gateway.verifyLedger()).toBeNull();
    const spend = await gateway.spend(ws.id);
    expect(spend).toMatchObject({ workspaceId: ws.id, spentUsd: 0, capUsd: ws.budgetUsd });
  });

  it('refuses unknown profiles with a gateway error', async () => {
    const { gateway, ws } = await setup();
    await expect(
      gateway.complete({ workspaceId: ws.id, purpose: 'build:prose', tier: 'mid', profileId: 'nope', messages: [] }),
    ).rejects.toBeInstanceOf(GatewayError);
  });
});
