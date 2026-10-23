/**
 * Each model's answer wait (waits.ts): the sets and defaults the owner chose on 2026-10-22, and the models Settings lists,
 * one per provider and model the profiles use, each of the kind the profiles use it as. The mock's models have none.
 */
import type { ModelProfile } from '@byway/contracts';
import { describe, expect, it } from 'vitest';
import { PROFILES } from '../src/profiles.ts';
import { DEFAULT_WAIT_MINUTES, modelWaits, WAIT_CHOICES, waitMinutesFor } from '../src/waits.ts';

describe('answer waits', () => {
  it('offer the owner’s choices: text 15-60 (default 15), images 5-20 (default 15), video 30-75 (default 30)', () => {
    expect(WAIT_CHOICES).toEqual({ text: [15, 30, 45, 60], image: [5, 10, 15, 20], video: [30, 45, 60, 75] });
    expect(DEFAULT_WAIT_MINUTES).toEqual({ text: 15, image: 15, video: 30 });
  });

  it('list every model the profiles use, key or no key, once per provider and model, and none of the mock’s: 14 today', () => {
    const rows = modelWaits(PROFILES).map((m) => [m.provider, m.model, m.kind, m.defaultMinutes]);
    expect(rows).toEqual([
      ['anthropic', 'claude-opus-5-5', 'text', 15],
      ['anthropic', 'claude-sonnet-5-5', 'text', 15],
      ['openai', 'gpt-6-astra', 'text', 15],
      ['google', 'gemini-nano-banana-2.1', 'image', 15],
      ['fal', 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', 'video', 30],
      ['anthropic', 'claude-fable-5-1', 'text', 15],
      ['openai', 'gpt-image-2.5-sunburst', 'image', 15],
      ['fal', 'fal-ai/kling-video/v3/pro/image-to-video', 'video', 30],
      ['openai', 'gpt-6.1-sol', 'text', 15],
      ['openai', 'gpt-image-2.5-flare', 'image', 15],
      ['google', 'gemini-3.1-pro-preview', 'text', 15],
      ['google', 'gemini-3.8-flash', 'text', 15],
      ['openrouter', 'anthropic/claude-opus-5.5', 'text', 15],
      ['openrouter', 'anthropic/claude-sonnet-5.5', 'text', 15],
    ]);
    for (const m of modelWaits(PROFILES)) expect(m.choices).toEqual(WAIT_CHOICES[m.kind]);
  });

  it('take a replacement model at its kind’s default, and keep the first kind of a model a profile uses as two', () => {
    const swapped: ModelProfile[] = [
      { id: 'a', label: 'A', tiers: { big: { provider: 'google', model: 'gemini-4-pro' }, mid: { provider: 'google', model: 'gemini-3.8-flash' } }, image: { provider: 'google', model: 'gemini-3.8-flash' } },
      { id: 'b', label: 'B', tiers: { big: { provider: 'openrouter', model: 'gemini-3.8-flash' }, mid: { provider: 'mock', model: 'mock-mid' } }, video: { provider: 'fal', model: 'fal-ai/new-clip' } },
    ];
    expect(modelWaits(swapped).map((m) => `${m.provider}/${m.model}: ${m.kind} ${m.defaultMinutes}`)).toEqual([
      'google/gemini-4-pro: text 15',
      'google/gemini-3.8-flash: text 15',
      'openrouter/gemini-3.8-flash: text 15',
      'fal/fal-ai/new-clip: video 30',
    ]);
  });

  it('keep a choice only when its kind offers it, and otherwise the kind’s default', () => {
    expect(waitMinutesFor('text', undefined)).toBe(15);
    expect(waitMinutesFor('text', 60)).toBe(60);
    expect(waitMinutesFor('text', 5)).toBe(15);
    expect(waitMinutesFor('image', 5)).toBe(5);
    expect(waitMinutesFor('image', 30)).toBe(15);
    expect(waitMinutesFor('video', 75)).toBe(75);
    expect(waitMinutesFor('video', 20)).toBe(30);
  });
});
