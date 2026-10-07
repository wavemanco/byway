/**
 * Reading deliverables for the Result screen. Each medium has its own viewer (spec §5, Result); JSON
 * deliverables follow the output contracts of spec §3.3 and are validated before they are shown.
 */
import type { Medium } from '@byway/contracts';
import { z } from 'zod';

export type ResultKind = 'page' | 'markdown' | 'options' | 'storyboard' | 'diff';

const KINDS: Record<Medium, ResultKind> = {
  'web-page': 'page',
  prose: 'markdown',
  options: 'options',
  media: 'storyboard',
  'code-diff': 'diff',
};

export function resultKind(medium: Medium): ResultKind {
  return KINDS[medium];
}

const Option = z.object({ title: z.string(), pitch: z.string(), rationale: z.string() });
const Options = z.object({ options: z.array(Option) });

export type OptionItem = z.infer<typeof Option>;

function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parseOptions(text: string): OptionItem[] | null {
  const parsed = Options.safeParse(json(text));
  return parsed.success ? parsed.data.options.map(({ title, pitch, rationale }) => ({ title, pitch, rationale })) : null;
}

const Shot = z.object({
  shot: z.number(),
  description: z.string(),
  imagePrompt: z.string(),
  durationSec: z.number(),
  /** Not in the model's output contract: the runner adds the generated frame's artifact id. */
  imageArtifactId: z.string().optional(),
});
const Storyboard = z.object({ storyboard: z.array(Shot).min(1), voiceover: z.string() });

export type StoryboardShot = z.infer<typeof Shot>;

export interface StoryboardModel {
  shots: StoryboardShot[];
  voiceover: string;
  totalSec: number;
}

export function parseStoryboard(text: string): StoryboardModel | null {
  const parsed = Storyboard.safeParse(json(text));
  if (!parsed.success) return null;
  const shots = parsed.data.storyboard.map((s) => ({
    shot: s.shot,
    description: s.description,
    imagePrompt: s.imagePrompt,
    durationSec: s.durationSec,
    ...(s.imageArtifactId ? { imageArtifactId: s.imageArtifactId } : {}),
  }));
  return { shots, voiceover: parsed.data.voiceover, totalSec: shots.reduce((t, s) => t + s.durationSec, 0) };
}
