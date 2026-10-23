/**
 * Settings' "How long to wait for an answer" (the waits design of 2026-10-22): one choice per model the profiles use,
 * grouped by provider, each from its kind's minutes (the owner's choices: text 15, 30, 45 or 60, default 15; images 5,
 * 10, 15 or 20, default 15; video 30, 45, 60 or 75, default 30). A wait the store keeps for a model no profile uses is
 * not shown, and a model no one chose for says it waits the default.
 */
import type { AnswerWait, ModelWait } from '@byway/contracts';
import { modelWaits, PROFILES } from '@byway/gateway';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnswerWaits, rowNote, waitsNote } from '../src/components/AnswerWaits.tsx';
import { answerWaitGroups, defaultsSentence, waitOption } from '../src/view/waits.ts';

const models: ModelWait[] = modelWaits(PROFILES);
const at = '2026-10-22T12:00:00.000Z';
const stored: AnswerWait[] = [
  { provider: 'anthropic', model: 'claude-opus-5-5', minutes: 45, changedAt: at },
  // A model no profile uses any more: kept by the store, not shown.
  { provider: 'google', model: 'gemini-3-pro-preview', minutes: 60, changedAt: at },
  // Minutes this model's kind does not offer (a text model at an image wait): read as not chosen.
  { provider: 'google', model: 'gemini-3.8-flash', minutes: 5, changedAt: at },
  { provider: 'fal', model: 'fal-ai/kling-video/v3/pro/image-to-video', minutes: 75, changedAt: at },
];

describe('the answer waits Settings lists', () => {
  it('are every profile’s models, grouped by provider in Settings’ order, none of the mock’s, each at its choice or its kind’s default', () => {
    const groups = answerWaitGroups(models, stored);
    expect(groups.map((g) => g.name)).toEqual(['Anthropic', 'OpenAI', 'Google', 'OpenRouter', 'fal.ai']);
    expect(groups.flatMap((g) => g.rows.map((r) => `${r.provider}/${r.model} ${r.kind} ${r.minutes}${r.chosen ? ' chosen' : ''}`))).toEqual([
      'anthropic/claude-opus-5-5 text 45 chosen',
      'anthropic/claude-sonnet-5-5 text 15',
      'anthropic/claude-fable-5-1 text 15',
      'openai/gpt-6-astra text 15',
      'openai/gpt-image-2.5-sunburst image 15',
      'openai/gpt-6.1-sol text 15',
      'openai/gpt-image-2.5-flare image 15',
      'google/gemini-nano-banana-2.1 image 15',
      'google/gemini-3.1-pro-preview text 15',
      'google/gemini-3.8-flash text 15',
      'openrouter/anthropic/claude-opus-5.5 text 15',
      'openrouter/anthropic/claude-sonnet-5.5 text 15',
      'fal/fal-ai/kling-video/v2.5-turbo/pro/image-to-video video 30',
      'fal/fal-ai/kling-video/v3/pro/image-to-video video 75 chosen',
    ]);
    expect(answerWaitGroups([...models, { provider: 'mock', model: 'mock-big', kind: 'text', choices: [15], defaultMinutes: 15 }], []).some((g) => g.provider === 'mock')).toBe(false);
  });

  it('say what each kind waits by default, and mark the default among the choices', () => {
    expect(defaultsSentence(answerWaitGroups(models, []))).toBe('15 minutes for text and images, 30 for video clips');
    expect(waitOption(15, 15)).toBe('15 minutes (default)');
    expect(waitOption(30, 15)).toBe('30 minutes');
    expect(rowNote({ kind: 'video', chosen: true })).toBe('Video clips');
    expect(rowNote({ kind: 'image', chosen: false })).toBe('Images. Not chosen yet, so it waits the default.');
  });

  it('show the help text, each model’s own choices with the one in force selected, and which models wait the default', () => {
    const groups = answerWaitGroups(models, stored);
    const html = renderToStaticMarkup(createElement(AnswerWaits, { groups }));
    expect(html).toContain('<h2 id="');
    expect(html).toContain('How long to wait for an answer</h2>');
    expect(waitsNote(groups)).toContain('For text that streams in, this is how long the model may send nothing.');
    expect(waitsNote(groups)).toContain('A change applies from the model’s next call');
    expect(waitsNote(groups)).toContain('waits its kind’s default: 15 minutes for text and images, 30 for video clips.');
    expect(html).toContain(waitsNote(groups));
    // One choice per model, each from its kind's minutes.
    const selects = html.match(/<select[^>]*>.*?<\/select>/g) ?? [];
    expect(selects).toHaveLength(14);
    const options = (s: string) => [...s.matchAll(/<option value="(\d+)"( selected="")?>([^<]*)<\/option>/g)].map((m) => `${m[3]}${m[2] ? ' *' : ''}`);
    expect(options(selects[0] ?? '')).toEqual(['15 minutes (default)', '30 minutes', '45 minutes *', '60 minutes']);
    expect(options(selects[4] ?? '')).toEqual(['5 minutes', '10 minutes', '15 minutes (default) *', '20 minutes']);
    expect(options(selects[13] ?? '')).toEqual(['30 minutes (default)', '45 minutes', '60 minutes', '75 minutes *']);
    expect(html.match(/Not chosen yet, so it waits the default\./g)).toHaveLength(12);
    expect(html).not.toContain('gemini-3-pro-preview');
    // Each choice is named by its model and described by its note.
    expect(html).toMatch(/<label class="wait-model" for="([^"]+)">claude-opus-5-5<\/label><p id="\1-note"[^>]*>Text<\/p><\/div><select id="\1"[^>]*aria-describedby="\1-note"/);
  });
});
