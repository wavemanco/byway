import { MEDIA, type Medium } from '@byway/protocol';

/**
 * The output contracts of product spec §3.3, as data. Every template names the one it must satisfy in its front
 * matter (`output:`), so a test can hold each template to its step's role and medium, and the runner's parsers and
 * the gateway's mock responders can be checked against the same names. No Node built-ins: safe in workflow bundles.
 */
export const OUTPUT_CONTRACTS = {
  'artifact:web-page': 'One fenced html block holding a complete HTML document (inline CSS/JS; images by the URLs given)',
  'artifact:prose': 'The Markdown document (optionally in one fenced markdown block)',
  'artifact:options': 'One fenced json block: {"options":[{"title":string,"pitch":string,"rationale":string}]}',
  // Spec §3.3 (contracts v5): the on-screen copy (headline, tagline, per-shot caption) is optional and is what the late
  // VOICE edits; the voice-over is locked after the VO script step.
  'artifact:media':
    'One fenced json block: {"storyboard":[{"shot":number,"description":string,"imagePrompt":string,"durationSec":number,"caption"?:string}],"voiceover":string,"headline"?:string,"tagline"?:string}',
  'artifact:code-diff': 'One fenced diff block (unified diff), then a paragraph starting "Why:"',
  critique:
    'The critique as a bullet list, biggest gaps first, then a last line "Score: N/10" (OK mode); or, in GREAT mode (ADR-0072), each item\'s bullets under its "### A" heading, then a last line "Ranking: C, A, E, B, D" naming every label once, best first (the critic is never told which item is ours)',
  choice: 'Optional reasoning, then a last line "Choice: <label>" (labels A, B, C…)',
  defects: 'A bullet list of defects, or the single line "No defects."',
  cut: 'A bullet list of removals, each starting with a removal verb (Remove, Delete, Drop, Merge), or the single line "Nothing to remove."',
  'tells-hits': 'One fenced json block: {"hits":[{"pattern":string,"where":string,"alternative":string}]}',
  keep: 'Optional reasoning, then a last line "Keep: A" or "Keep: B"',
  'plain-text': 'Plain text',
  // Spec §3.3 (ADR-0101): a template whose front matter says advice: yes (only C3's header image) may add one optional
  // line of advice for the person beside the images; it never stops the image.
  'image-briefs':
    'One fenced json block: {"images":[{"slot":string,"prompt":string,"alt":string,"size":"1024x1024"|"1536x1024"|"1024x1536"}],"advice"?:string} ("advice" only where the template says advice: yes: one short sentence for the person, at most 200 characters)',
  intake: 'One fenced json block: {"answers":[{"questionId":string,"answer":boolean,"confidence":number,"rationale":string}],"routes":{[routeId]:string}}',
  recipe: 'One fenced json block holding a byway.recipe/1 object',
  dedupe: 'One fenced json block: {"keep":[label…],"merged":[{"into":label,"from":[label…]}]}',
  overlap: 'One fenced json block: {"flags":[{"label":label,"overlapsWith":string,"note":string}]} (annotation only)',
  relay: 'One fenced json block: {"clipPrompt":string,"durationSec":number}',
  /** Not a model call: the text of a tell catalog, which the runner puts in the `tells` slot of a TELLS sweep. */
  catalog: 'Not a model call: tell catalog text for the tells slot',
  /** A step with no v1 executor (ADR-0069): it finishes skipped, so nothing is parsed. */
  none: 'No model answer in v1: the step finishes skipped with a plain note (ADR-0069)',
} as const;

export type OutputId = keyof typeof OUTPUT_CONTRACTS;
export const OUTPUT_IDS = Object.keys(OUTPUT_CONTRACTS) as OutputId[];

const isMedium = (m: string | undefined): m is Medium => (MEDIA as readonly string[]).includes(m ?? '');

/** Roles and helpers whose answer is the artifact itself, in the medium's format. */
const ARTIFACT_ROLES = new Set(['build', 'seed', 'fix', 'asset.integrate']);

const BY_ROLE: Record<string, OutputId> = {
  critic: 'critique',
  judge: 'choice',
  select: 'choice',
  rerank: 'choice',
  check: 'defects',
  cut: 'cut',
  'tells-sweep': 'tells-hits',
  'tells-compare': 'keep',
  vision: 'plain-text',
  // An ASSET step's model call writes image briefs (spec §3.2: the runner generates the images, then integrates them).
  asset: 'image-briefs',
  'asset.briefs': 'image-briefs',
  dedupe: 'dedupe',
  overlap: 'overlap',
  relay: 'relay',
};

const ADVISOR: Record<string, OutputId> = {
  'advisor.intake': 'intake',
  'advisor.compose': 'recipe',
  'advisor.compose.repair': 'recipe',
};

/** The contract a gateway call's answer must meet, from its purpose (`build:web-page`, `rerank:prose`, `advisor.intake`…). */
export function outputForPurpose(purpose: string): OutputId {
  const advisor = ADVISOR[purpose];
  if (advisor) return advisor;
  const i = purpose.lastIndexOf(':');
  const role = i < 0 ? purpose : purpose.slice(0, i);
  const medium = i < 0 ? undefined : purpose.slice(i + 1);
  if (!ARTIFACT_ROLES.has(role) && !BY_ROLE[role]) throw new Error(`Unknown purpose "${purpose}"`);
  if (!isMedium(medium)) throw new Error(`Purpose "${purpose}" needs a medium (${MEDIA.join(', ')})`);
  return ARTIFACT_ROLES.has(role) ? `artifact:${medium}` : (BY_ROLE[role] as OutputId);
}

/**
 * The contract for a recipe step's own prompt. Human and tool steps have none. An ASSET step that consumes the
 * `voice` port turns a locked script into audio (C5 `vo-audio`), which has no v1 executor (ADR-0069). A model VOICE or
 * render step is parsed as the work by the runner, as any model role its parser does not name (ADR-0092 stage 4), so
 * its prompt answers with the artifact; admission refuses a model VOICE (DR9, ST12) all the same.
 */
export function outputForStep(step: { role: string; consumes: readonly string[] }, medium: Medium): OutputId {
  if (step.role === 'voice' || step.role === 'render') return `artifact:${medium}`;
  if (step.role === 'asset' && step.consumes.includes('voice')) return 'none';
  return outputForPurpose(`${step.role}:${medium}`);
}
