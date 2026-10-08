import { MEDIA, type Medium } from '@byway/contracts';
import { compose, intake } from './advisor.ts';
import { htmlDocument, imageRefs, lastFenced, subjectOf } from './extract.ts';
import { assetBriefs, choose, critique, cutDirective, defects, keep, tellsSweep, vision } from './judging.ts';
import { renderProse, reviseProse } from './prose.ts';
import { renderDiff, renderOptions, renderStoryboard } from './structured.ts';
import { integrateImages, renderPage, revisePage } from './web-page.ts';

/**
 * Deterministic demo-mode answers keyed by purpose (spec §3.3). Every responder returns text that meets the output
 * contract the runner's parsers expect, so the whole product is navigable with no keys.
 */

export interface MockContext {
  purpose: string;
  /** The role or helper part of the purpose: `build`, `critic`, `asset.briefs`, `advisor.intake`… */
  role: string;
  /** The medium part of the purpose; undefined for advisor helpers. */
  medium: Medium | undefined;
  system: string;
  /** All user-message text, joined. */
  prompt: string;
  /** Number of images attached (renders, for screenshot views). */
  images: number;
  /** Seed from the prompt: same prompt, same answer. */
  seed: number;
  /** Prior calls with the same run, step and purpose (critic loops, fix turns). */
  iteration: number;
}

export type Responder = (ctx: MockContext) => string;

export function parsePurpose(purpose: string): { role: string; medium: Medium | undefined } {
  const i = purpose.lastIndexOf(':');
  if (i < 0) return { role: purpose, medium: undefined };
  const medium = purpose.slice(i + 1);
  return { role: purpose.slice(0, i), medium: (MEDIA as readonly string[]).includes(medium) ? (medium as Medium) : undefined };
}

const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;
const json = (value: unknown) => fence('json', JSON.stringify(value, null, 2));

/** build, seed, fix, asset, asset.integrate and voice.apply: the artifact in its medium's format. */
const artifact: Responder = (ctx) => {
  const subject = subjectOf(ctx.prompt);
  const medium = ctx.medium ?? 'prose';
  const revising = ctx.role === 'fix' || ctx.role === 'voice.apply' || ctx.role === 'asset.integrate';
  switch (medium) {
    case 'web-page': {
      const existing = revising ? htmlDocument(ctx.prompt) : undefined;
      let html = existing ?? renderPage({ seed: ctx.seed, subject });
      if (ctx.role === 'fix' && existing) html = revisePage(existing, ctx.iteration);
      if (ctx.role === 'asset.integrate') html = integrateImages(html, imageRefs(ctx.prompt).map((url, i) => ({ url, alt: `Image ${i + 1} for ${subject.slice(0, 60)}` })));
      return `Here is the page.\n\n${fence('html', html)}`;
    }
    case 'prose': {
      const existing = revising ? lastFenced(ctx.prompt, ['markdown', 'md']) : undefined;
      const doc = existing !== undefined ? (ctx.role === 'voice.apply' ? existing : reviseProse(existing)) : renderProse(ctx.seed, subject);
      return fence('markdown', doc.trimEnd());
    }
    case 'options':
      return json(renderOptions(ctx.seed, subject));
    case 'media':
      return json(renderStoryboard(ctx.seed, subject));
    case 'code-diff':
      return renderDiff(ctx.seed, ctx.role === 'fix' ? ctx.iteration + 1 : 0);
  }
};

/** GREAT-mode critics are asked for a rank against a lineup; the prompt says so with the `Rank: N of M` line. */
function rankLineup(ctx: MockContext): number | undefined {
  const text = `${ctx.system}\n${ctx.prompt}`;
  if (!/Rank:\s*N\s+of\s+M|\bGREAT\b/.test(text)) return undefined;
  const refs = /\b(\d+)\s+(?:references|reference pages|exemplars|published (?:pieces|passages))\b/i.exec(text);
  return Math.max(2, Math.min(12, Number(refs?.[1] ?? 5) + 1));
}

export const DEFAULT_RESPONDERS: Readonly<Record<string, Responder>> = {
  build: artifact,
  seed: artifact,
  fix: artifact,
  asset: artifact,
  'asset.integrate': artifact,
  'voice.apply': artifact,
  critic: (ctx) => {
    const rankOf = rankLineup(ctx);
    return critique({ seed: ctx.seed, medium: ctx.medium ?? 'prose', iteration: ctx.iteration, ...(rankOf !== undefined ? { rankOf } : {}) });
  },
  judge: (ctx) => choose(ctx.seed, ctx.prompt, ctx.images),
  select: (ctx) => choose(ctx.seed, ctx.prompt, ctx.images),
  rerank: (ctx) => choose(ctx.seed, ctx.prompt, ctx.images),
  check: (ctx) => defects(ctx.prompt),
  cut: (ctx) => cutDirective(ctx.seed, ctx.medium ?? 'prose'),
  'tells-sweep': (ctx) => json(tellsSweep(ctx.seed, ctx.medium ?? 'prose', ctx.prompt)),
  'tells-compare': (ctx) => keep(ctx.seed),
  vision: (ctx) => vision(ctx.seed, subjectOf(ctx.prompt)),
  'asset.briefs': (ctx) => json(assetBriefs(ctx.seed, subjectOf(ctx.prompt), ctx.prompt)),
  'advisor.intake': (ctx) => json(intake(ctx.prompt)),
  'advisor.compose': (ctx) => json(compose(ctx.prompt)),
  'advisor.compose.repair': (ctx) => json(compose(ctx.prompt)),
};

/** Roles with no output contract of their own (relay, for instance) get a short plain-text acknowledgement. */
const fallback: Responder = (ctx) => `Done: ${ctx.role} step completed in demo mode.`;

/** Find the responder: an override for the exact purpose, then for the role, then the defaults. */
export function respond(ctx: MockContext, overrides: Readonly<Record<string, Responder>> = {}): string {
  const r = overrides[ctx.purpose] ?? overrides[ctx.role] ?? DEFAULT_RESPONDERS[ctx.role] ?? fallback;
  return r(ctx);
}
