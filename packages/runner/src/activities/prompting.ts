/**
 * Prompt slots by port (spec §3.2) and the images that ride along. The runner fills: `intent` → problem (the run's
 * brief, read from the file Runner.start stored it in: P2), `brief` → brief, `artifact` → artifact (never for judging
 * steps: port rule 1), a text `view` → view and a screenshot view → attached images, `option_set` → options (labelled
 * A, B, C…), `critique` → critique, `taste`/`voice`/`tells`/`seed`/`refs` → slots of the same name; `score` never
 * reaches a prompt (port rule 2). The artifact slot holds the artifact's raw text: templates put it in its medium's
 * fence (@byway/prompts' ARTIFACT_FENCE).
 *
 * Slot layouts (the problem, "### A" options, "### V1" control answers) come from @byway/prompts, the one place the
 * templates, the gateway's mock and the runner agree on them (spec §3.3 shared conventions).
 *
 * A web page's screenshots are attached by surface (RENDER-1): each surface's images follow a line naming it ("Wide
 * screen, …", "Phone, …", "First screen, …"), as the critic, defect-check and tells-sweep prompts describe them, and a
 * step's `renders` knob picks which surfaces it is shown.
 */
import type { ChatMessage, ContentPart, MediaType, Medium, ProblemBrief, PromptSlot } from '@byway/contracts';
import { inputsOf } from '@byway/recipe';
import { labelled, labelOf, problemSlot, vanillaLabelled } from '@byway/prompts/pure';
import { textView, viewKindOf } from '../formats.ts';
import { readBrief, unreadableInput } from '../stored-inputs.ts';
import { rendersKnob, SURFACE_CAPTIONS } from '../surfaces.ts';
import type { Ports, StepSpec, Surface, View, ViewRef } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { StepError } from './failures.ts';

export type Slots = Partial<Record<PromptSlot, string>>;

/**
 * Images to attach, in groups. A labelled group is introduced by its "### A" heading (once for consecutive groups with
 * the same label); a captioned group by its caption line (a web page's surface, a relay link's frames).
 */
export interface ImageGroup {
  label?: string;
  caption?: string;
  artifactIds: string[];
}

/**
 * One view item's images as groups: its captioned groups when it has them (a relay link's frames); one per surface,
 * captioned, when the item is a web page rendered by surface (narrowed to `renders` when given; all of them if none is
 * left); else one group of all its images.
 */
export function surfaceGroups(item: ViewRef, label?: string, renders?: readonly Surface[]): ImageGroup[] {
  const at = label === undefined ? {} : { label };
  // Captioned images (a relay link's start frame and its clip's last frame): each under the caption saying what it is.
  if (item.groups?.length) return item.groups.filter((g) => g.imageArtifactIds.length).map((g) => ({ ...at, caption: g.caption, artifactIds: g.imageArtifactIds }));
  if (!item.surfaces?.length) return item.imageArtifactIds.length ? [{ ...at, artifactIds: item.imageArtifactIds }] : [];
  const picked = renders?.length ? item.surfaces.filter((s) => renders.includes(s.surface)) : [];
  return (picked.length ? picked : item.surfaces).filter((s) => s.imageArtifactIds.length).map((s) => ({ ...at, caption: SURFACE_CAPTIONS[s.surface], artifactIds: s.imageArtifactIds }));
}

/** Roles that judge the work and so never see its source (port rule 1). */
export const JUDGING_ROLES: ReadonlySet<string> = new Set(['critic', 'judge', 'check', 'tells-sweep', 'tells-compare', 'rerank']);

const IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** Reads artifacts for prompts, caching within one activity. */
export class ArtifactReader {
  private readonly texts = new Map<string, string>();
  private readonly types = new Map<string, string>();
  private readonly briefs = new Map<string, ProblemBrief>();
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

  /**
   * A file the run was started with (P2, stored-inputs.ts), by its id. One the store cannot find, or finds damaged,
   * was lost after the run began (a partial restore): the step fails plainly and for good (StepError), since reading
   * it again finds the same. Any other trouble reading it is left to the activity's retries.
   */
  async startInput(id: string, what: string): Promise<string> {
    try {
      return await this.text(id);
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (code === 'not-found' || code === 'corrupt') throw new StepError(unreadableInput(what, id));
      throw e;
    }
  }

  /** The run's brief (RunRef.problemId): read from its file once per activity, however many prompts show it. */
  async problem(id: string): Promise<ProblemBrief> {
    const hit = this.briefs.get(id);
    if (hit) return hit;
    const brief = readBrief(await this.startInput(id, 'brief'));
    if (!brief) throw new StepError(unreadableInput('brief', id));
    this.briefs.set(id, brief);
    return brief;
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

/**
 * A view's text for the view slot and its images, labelled A, B, C… when it is a pool. `renders` (a step's knob)
 * picks a web page's surfaces.
 */
export async function viewParts(reader: ArtifactReader, view: View | undefined, renders?: readonly Surface[]): Promise<{ text: string; images: ImageGroup[] }> {
  if (!view || view.items.length === 0) return { text: '', images: [] };
  if (!view.pool) {
    const item = view.items[0]!;
    return { text: await reader.viewText(item), images: surfaceGroups(item, undefined, renders) };
  }
  const texts = await Promise.all(view.items.map((v) => reader.viewText(v)));
  const anyText = texts.some((t) => t.trim());
  return {
    text: anyText ? labelled(texts.map((t) => t || '(see the images under this label)')) : '',
    images: view.items.flatMap((v, i) => surfaceGroups(v, labelOf(i), renders)),
  };
}

export interface BuiltPrompt {
  slots: Slots;
  images: ImageGroup[];
}

export interface SlotContext {
  medium: Medium;
  /** The run's brief, by its id (RunRef.problemId): read only when the step takes the brief in. */
  problemId: string;
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
 * The slots a step's ports fill, and the images it sees: the ports it consumes, then those it reads when they are
 * there (ADR-0089). A port with no value yet, consumed or read, fills its slot with an empty string, so a template's
 * optional sections ({{#if}}) leave it out.
 */
export async function buildPrompt(reader: ArtifactReader, ctx: SlotContext): Promise<BuiltPrompt> {
  const { step, ports, medium } = ctx;
  const slots: Slots = { medium };
  const images: ImageGroup[] = [];
  const judging = JUDGING_ROLES.has(step.role);
  // A judge's prompt is the same every time (01 CRITIC: frozen, fresh context): it never learns which round it is.
  if (ctx.round !== undefined && !judging && !step.frozenPrompt) slots.round = String(ctx.round);
  for (const port of inputsOf(step)) {
    switch (port) {
      case 'intent':
        slots.problem = problemSlot(await reader.problem(ctx.problemId));
        break;
      case 'brief':
        slots.brief = ports.brief ?? '';
        break;
      case 'artifact':
        if (!judging) slots.artifact = ports.artifact ? await reader.text(ports.artifact) : '';
        break;
      case 'view': {
        // For an overlap step this is the seeded pool, labelled A, B, C… (its options are the unseeded answers).
        const v = await viewParts(reader, ports.view, rendersKnob(step.knobs));
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
            if (v) images.push(...surfaceGroups(v, labelOf(i), rendersKnob(step.knobs)));
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

/**
 * The user message: the rendered text, then each image group: its "### A" heading first when labelled (once for a
 * run of groups under the same label, so a page's surfaces share their candidate's heading), then its caption line.
 */
export async function userMessage(reader: ArtifactReader, text: string, groups: readonly ImageGroup[]): Promise<ChatMessage> {
  const content: ContentPart[] = [{ type: 'text', text }];
  let heading: string | undefined;
  for (const g of groups) {
    const parts: ContentPart[] = [];
    for (const id of g.artifactIds) {
      const mediaType = await reader.mediaType(id);
      if (IMAGE_TYPES.has(mediaType)) parts.push({ type: 'image', artifactId: id, mediaType: mediaType as MediaType });
    }
    if (!parts.length) continue;
    if (g.label && g.label !== heading) content.push({ type: 'text', text: `### ${g.label}` });
    heading = g.label;
    if (g.caption) content.push({ type: 'text', text: g.caption });
    content.push(...parts);
  }
  return { role: 'user', content };
}
