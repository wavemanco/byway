/**
 * Prompt slots by port (spec §3.2) and the images that ride along. The runner fills: `intent` → problem, `brief` →
 * brief, `artifact` → artifact (never for judging steps: port rule 1), a text `view` → view and a screenshot view →
 * attached images, `option_set` → options (labelled A, B, C…), `critique` → critique, `taste`/`voice`/`tells`/`seed`/
 * `refs` → slots of the same name; `score` never reaches a prompt (port rule 2). The artifact slot holds the artifact's
 * raw text: templates put it in its medium's fence (ARTIFACT_FENCE).
 */
import type { ChatMessage, ContentPart, MediaType, Medium, ProblemBrief, PromptSlot } from '@byway/contracts';
import { textView, viewKindOf } from '../formats.ts';
import { labelled, labelOf, vanillaLabelled } from '../labels.ts';
import type { Ports, StepSpec, View, ViewRef } from '../types.ts';
import type { RunnerDeps } from './deps.ts';

export type Slots = Partial<Record<PromptSlot, string>>;

/** Images to attach, in groups; a labelled group is introduced by its "### A" heading. */
export interface ImageGroup {
  label?: string;
  artifactIds: string[];
}

/** Roles that judge the work and so never see its source (port rule 1). */
export const JUDGING_ROLES: ReadonlySet<string> = new Set(['critic', 'judge', 'check', 'tells-sweep', 'tells-compare', 'rerank']);

const IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** The `problem` slot: the user's words, the brief fields they gave, then pasted material, each fenced. */
export function problemSlot(p: ProblemBrief): string {
  const fence = (text: string) => '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  const parts = [p.text.trim()];
  const fields = [
    ...(p.deliverable ? [`Deliverable: ${p.deliverable}`] : []),
    ...(p.audience ? [`Audience: ${p.audience}`] : []),
    ...(p.constraints?.length ? ['Constraints:', ...p.constraints.map((c) => `- ${c}`)] : []),
  ];
  if (fields.length) parts.push(fields.join('\n'));
  for (const a of p.attachments ?? []) {
    const f = fence(a.text);
    parts.push(`Attachment: ${a.name}\n${f}\n${a.text.replace(/\n+$/, '')}\n${f}`);
  }
  return parts.join('\n\n');
}

/** Reads artifacts for prompts, caching within one activity. */
export class ArtifactReader {
  private readonly texts = new Map<string, string>();
  private readonly types = new Map<string, string>();
  private readonly deps: Pick<RunnerDeps, 'store'>;
  constructor(deps: Pick<RunnerDeps, 'store'>) {
    this.deps = deps;
  }

  async text(id: string): Promise<string> {
    const hit = this.texts.get(id);
    if (hit !== undefined) return hit;
    const text = await this.deps.store.artifacts.getText(id);
    this.texts.set(id, text);
    return text;
  }

  async mediaType(id: string): Promise<string> {
    const hit = this.types.get(id);
    if (hit !== undefined) return hit;
    const { record } = await this.deps.store.artifacts.get(id);
    this.types.set(id, record.mediaType);
    return record.mediaType;
  }

  async isImage(id: string): Promise<boolean> {
    return IMAGE_TYPES.has(await this.mediaType(id));
  }

  /** The text half of a view, if it has one. */
  async viewText(ref: ViewRef | undefined): Promise<string> {
    return ref?.textArtifactId ? this.text(ref.textArtifactId) : '';
  }

  /** How a candidate reads in an options slot: its text view (screenshot media show their images instead). */
  async candidateText(medium: Medium, id: string): Promise<string> {
    if (medium === 'web-page') return '(The screenshots under this label show it.)';
    return textView(medium, await this.text(id));
  }
}

/** A view's text for the view slot and its images, labelled A, B, C… when it is a pool. */
export async function viewParts(reader: ArtifactReader, view: View | undefined): Promise<{ text: string; images: ImageGroup[] }> {
  if (!view || view.items.length === 0) return { text: '', images: [] };
  if (!view.pool) {
    const item = view.items[0]!;
    return { text: await reader.viewText(item), images: item.imageArtifactIds.length ? [{ artifactIds: item.imageArtifactIds }] : [] };
  }
  const texts = await Promise.all(view.items.map((v) => reader.viewText(v)));
  const anyText = texts.some((t) => t.trim());
  return {
    text: anyText ? labelled(texts.map((t) => t || '(see the images under this label)')) : '',
    images: view.items.map((v, i) => ({ label: labelOf(i), artifactIds: v.imageArtifactIds })).filter((g) => g.artifactIds.length > 0),
  };
}

export interface BuiltPrompt {
  slots: Slots;
  images: ImageGroup[];
}

export interface SlotContext {
  medium: Medium;
  problem: ProblemBrief;
  step: StepSpec;
  ports: Ports;
  round?: number;
  seed?: string;
  tells?: string;
  /** Overrides for slots the caller lays out itself (GREAT lineups, relay briefs, image lists). */
  extra?: Slots;
  /** Images the caller adds (the relay anchor, the GREAT lineup's screenshots). */
  extraImages?: ImageGroup[];
}

/**
 * The slots a step's consumed ports fill, and the images it sees. A consumed port with no value yet fills its slot
 * with an empty string, so a template's optional sections can test for it.
 */
export async function buildPrompt(reader: ArtifactReader, ctx: SlotContext): Promise<BuiltPrompt> {
  const { step, ports, medium } = ctx;
  const slots: Slots = { medium };
  const images: ImageGroup[] = [];
  if (ctx.round !== undefined) slots.round = String(ctx.round);
  const judging = JUDGING_ROLES.has(step.role);
  for (const port of step.consumes) {
    switch (port) {
      case 'intent':
        slots.problem = problemSlot(ctx.problem);
        break;
      case 'brief':
        slots.brief = ports.brief ?? '';
        break;
      case 'artifact':
        if (!judging) slots.artifact = ports.artifact ? await reader.text(ports.artifact) : '';
        break;
      case 'view': {
        // For an overlap step this is the seeded pool, labelled A, B, C… (its options are the unseeded answers).
        const v = await viewParts(reader, ports.view);
        slots.view = v.text;
        images.push(...v.images);
        break;
      }
      case 'option_set<artifact>': {
        const ids = ports.options ?? [];
        const texts = await Promise.all(ids.map((id) => reader.candidateText(medium, id)));
        slots.options = step.role === 'overlap' ? vanillaLabelled(texts) : labelled(texts);
        if (viewKindOf(medium) === 'screenshots' && step.role !== 'overlap') {
          (ports.optionViews ?? []).forEach((v, i) => {
            if (v?.imageArtifactIds.length) images.push({ label: labelOf(i), artifactIds: v.imageArtifactIds });
          });
        }
        break;
      }
      case 'critique':
        slots.critique = ports.critique ?? '';
        break;
      case 'taste':
        slots.taste = ports.taste ?? '';
        break;
      case 'voice':
        slots.voice = ports.voice ?? '';
        break;
      case 'tells':
        slots.tells = ctx.tells ?? '';
        break;
      case 'seed':
        slots.seed = ctx.seed ?? '';
        break;
      case 'refs':
        slots.refs = '';
        slots.labels = '';
        break;
      default:
        // score never reaches a prompt (port rule 2); anchor and asset travel as images or not at all.
        break;
    }
  }
  // SEED steps take the runner's random string even though `seed` is not a declared port of the recipe step.
  if (step.role === 'seed' && ctx.seed !== undefined) slots.seed = ctx.seed;
  Object.assign(slots, ctx.extra ?? {});
  images.push(...(ctx.extraImages ?? []));
  return { slots, images };
}

/** The user message: the rendered text, then each image group (its "### A" heading first, when labelled). */
export async function userMessage(reader: ArtifactReader, text: string, groups: readonly ImageGroup[]): Promise<ChatMessage> {
  const content: ContentPart[] = [{ type: 'text', text }];
  for (const g of groups) {
    const parts: ContentPart[] = [];
    for (const id of g.artifactIds) {
      const mediaType = await reader.mediaType(id);
      if (IMAGE_TYPES.has(mediaType)) parts.push({ type: 'image', artifactId: id, mediaType: mediaType as MediaType });
    }
    if (!parts.length) continue;
    if (g.label) content.push({ type: 'text', text: `### ${g.label}` });
    content.push(...parts);
  }
  return { role: 'user', content };
}
