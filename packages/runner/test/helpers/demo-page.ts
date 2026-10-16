/**
 * The C1 demo page the mock gateway builds for one fixed brief and seed (what a demo run's first draft looks like), read
 * through the gateway's public mock API so tests compare against the page a demo run really gets.
 */
import { respond } from '@byway/gateway';

export function demoPage(subject = 'A bakery that delivers bread before seven', seed = 7): string {
  const answer = respond({ purpose: 'build:web-page', role: 'build', medium: 'web-page', system: '', prompt: `<problem>${subject}</problem>`, images: 0, seed, iteration: 0 });
  const html = /```html\n([\s\S]*?)\n```/.exec(answer)?.[1];
  if (html === undefined) throw new Error('The mock gateway gave no page.');
  return html;
}
