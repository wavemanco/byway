import { MEDIA, type Medium } from '@byway/contracts';
import { compose, intake } from './advisor.ts';
import { briefsFor, documentIn, integrateProse } from './assets.ts';
import { htmlDocument, imageLines, imageRefs, lastFenced, subjectOf } from './extract.ts';
import { dedupe, overlap } from './glue.ts';
import { choose, critique, cutDirective, defects, greatCritique, keep, tellsSweep, vision } from './judging.ts';
import { blindRanking, lineupItems, lineupOf, lookOf, type Attachment, type LineupMemory } from './lineup.ts';
import { relayLink } from './media.ts';
import { renderProse, reviseProse } from './prose.ts';
import { markDiffAnswer, markProse, nextRevision } from './revision.ts';
import { renderDiff, renderOptions, renderStoryboard } from './structured.ts';
import { integrateImages, renderPage, revisePage } from './web-page.ts';

/**
 * Deterministic demo-mode answers keyed by purpose (spec §3.3). Every responder returns text that meets the output
 * contract the runner's parsers expect, so the whole product is navigable with no keys. Prompts follow the shared slot
 * conventions (the problem in <problem>, the current artifact as one fenced block, candidates under "### A" headings,
 * unseeded overlap answers under "### V1", the relay brief as "Shot N"), and the responders read them that way.
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
  /** Attached images in message order, each with the "### X" label it was attached under (GREAT lineups of screenshots). */
  attachments?: readonly Attachment[];
  /** What a GREAT critic saw in earlier calls of this loop (the same run, step and purpose); see lineup.ts. */
  lineupMemory?: LineupMemory;
}

/**
 * A mock answer: its text, or the text with `truncated: true` to stand in for an answer cut off at the output cap. The
 * mock never truncates on its own; only a test's responder asks for it.
 */
export type MockReply = string | { text: string; truncated?: boolean };

export type Responder = (ctx: MockContext) => MockReply;

export function parsePurpose(purpose: string): { role: string; medium: Medium | undefined } {
  const i = purpose.lastIndexOf(':');
  if (i < 0) return { role: purpose, medium: undefined };
  const medium = purpose.slice(i + 1);
  return { role: purpose.slice(0, i), medium: (MEDIA as readonly string[]).includes(medium) ? (medium as Medium) : undefined };
}

const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;
const json = (value: unknown) => fence('json', JSON.stringify(value, null, 2));

/** The structured artifact (options or storyboard JSON) the prompt hands over, if it is one. */
function existingJson(prompt: string, key: 'options' | 'storyboard'): unknown {
  const block = lastFenced(prompt, ['json']);
  if (block === undefined) return undefined;
  try {
    const parsed = JSON.parse(block) as Record<string, unknown>;
    return Array.isArray(parsed[key]) && (parsed[key] as unknown[]).length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The diff the prompt hands over, with its "Why:" paragraph (the text after the block). */
function existingDiff(prompt: string): string | undefined {
  const m = /```diff[^\n]*\n([\s\S]*?)\n?```\s*(Why:[^\n]*(?:\n(?!\s*\n)[^\n]*)*)?/.exec(prompt);
  if (!m?.[1]) return undefined;
  return `${fence('diff', m[1])}\n\n${m[2]?.trim() || 'Why: the change keeps the behaviour and makes the code easier to review.'}`;
}

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
      if (ctx.role === 'asset.integrate') {
        const given = imageLines(ctx.prompt);
        const images = given.length ? given : imageRefs(ctx.prompt).map((url, i) => ({ url, alt: `Image ${i + 1} for ${subject.slice(0, 60)}` }));
        html = integrateImages(html, images);
      }
      return `Here is the page.\n\n${fence('html', html)}`;
    }
    case 'prose': {
      const existing = revising ? documentIn(ctx.prompt) : undefined;
      let doc = existing ?? renderProse(ctx.seed, subject);
      if (existing !== undefined && ctx.role === 'fix') doc = reviseProse(existing);
      if (existing !== undefined && ctx.role === 'asset.integrate') doc = integrateProse(existing, ctx.prompt);
      // The demo revision marker (revision.ts): new work is 1, a fix adds one, other turns keep what they were given.
      const revision = nextRevision(existing === undefined && ctx.role !== 'fix' ? 'build' : ctx.role, existing);
      return fence('markdown', (revision === undefined ? doc : markProse(doc, revision)).trimEnd());
    }
    // Structured artifacts come back as given on revising turns: the demo cannot apply edits to them faithfully.
    case 'options':
      return json((revising && existingJson(ctx.prompt, 'options')) || renderOptions(ctx.seed, subject));
    case 'media':
      return json((revising && existingJson(ctx.prompt, 'storyboard')) || renderStoryboard(ctx.seed, subject));
    case 'code-diff': {
      const given = revising ? existingDiff(ctx.prompt) : undefined;
      if (ctx.role !== 'fix' && given) return given;
      // The demo revision marker (revision.ts) in the Why paragraph: new work is 1, a fix adds one to what it was given.
      return markDiffAnswer(renderDiff(ctx.seed, ctx.role === 'fix' ? ctx.iteration + 1 : 0), nextRevision(ctx.role === 'fix' ? 'fix' : 'build', given) ?? 1);
    }
  }
};

/**
 * critic: OK mode answers `Score: N/10` (unchanged). GREAT mode (ADR-0071, ADR-0072) reads the lineup from "There are R
 * references and 1 of ours (M items, labelled A–X).", critiques every item and ranks them all blind: by the demo
 * revision markers and, failing those, by what is new since the loop's first call (lineup.ts). Demo mode only.
 */
const critic: Responder = (ctx) => {
  const medium = ctx.medium ?? 'prose';
  const lineup = lineupOf(`${ctx.system}\n${ctx.prompt}`);
  if (!lineup) return critique({ seed: ctx.seed, medium, iteration: ctx.iteration });
  const items = lineupItems(ctx.prompt, lineup, ctx.attachments ?? []);
  const looks = items.map(lookOf);
  const novelty = ctx.lineupMemory?.revise(looks) ?? [];
  return greatCritique({ medium, items: items.map((item, i) => ({ label: item.label, look: looks[i] ?? '' })), ranking: blindRanking(items, novelty) });
};

export const DEFAULT_RESPONDERS: Readonly<Record<string, Responder>> = {
  build: artifact,
  seed: artifact,
  fix: artifact,
  asset: artifact,
  'asset.integrate': artifact,
  'voice.apply': artifact,
  critic,
  judge: (ctx) => choose(ctx.seed, ctx.prompt, ctx.images),
  select: (ctx) => choose(ctx.seed, ctx.prompt, ctx.images),
  rerank: (ctx) => choose(ctx.seed, ctx.prompt, ctx.images),
  check: (ctx) => defects(ctx.prompt),
  cut: (ctx) => cutDirective(ctx.seed, ctx.medium ?? 'prose'),
  'tells-sweep': (ctx) => json(tellsSweep(ctx.seed, ctx.medium ?? 'prose', ctx.prompt)),
  'tells-compare': (ctx) => keep(ctx.seed),
  vision: (ctx) => vision(ctx.seed, subjectOf(ctx.prompt)),
  dedupe: (ctx) => json(dedupe(ctx.prompt)),
  overlap: (ctx) => json(overlap(ctx.seed, ctx.prompt)),
  relay: (ctx) => json(relayLink(ctx.seed, ctx.prompt)),
  'asset.briefs': (ctx) => json(briefsFor(ctx.medium ?? 'web-page', ctx.seed, subjectOf(ctx.prompt), ctx.prompt)),
  'advisor.intake': (ctx) => json(intake(ctx.prompt)),
  'advisor.compose': (ctx) => json(compose(ctx.prompt)),
  'advisor.compose.repair': (ctx) => json(compose(ctx.prompt)),
};

/** Roles with no output contract of their own get a short plain-text acknowledgement. */
const fallback: Responder = (ctx) => `Done: ${ctx.role} step completed in demo mode.`;

/** The default responder for a purpose (by exact purpose, then by role), or undefined when only the fallback would answer. */
export function responderFor(purpose: string): Responder | undefined {
  return DEFAULT_RESPONDERS[purpose] ?? DEFAULT_RESPONDERS[parsePurpose(purpose).role];
}

/** Find the responder (an override for the exact purpose, then for the role, then the defaults) and normalize its reply. */
export function reply(ctx: MockContext, overrides: Readonly<Record<string, Responder>> = {}): { text: string; truncated: boolean } {
  const r = overrides[ctx.purpose] ?? overrides[ctx.role] ?? responderFor(ctx.purpose) ?? fallback;
  const out = r(ctx);
  return typeof out === 'string' ? { text: out, truncated: false } : { text: out.text, truncated: out.truncated === true };
}

/** The answer text for `ctx`, as {@link reply} finds it. */
export function respond(ctx: MockContext, overrides: Readonly<Record<string, Responder>> = {}): string {
  return reply(ctx, overrides).text;
}
