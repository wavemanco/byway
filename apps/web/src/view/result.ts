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
  /** On-screen text over this shot (spec §3.3; C4: the late Your words step edits it, with the headline and tagline). */
  caption: z.string().optional(),
  /** Not in the model's output contract: the runner adds the generated frame's artifact id (spec §3.2 Storyboards). */
  imageArtifactId: z.string().optional(),
  /** Added by the runner when a relay link made this shot's clip (ADR-0069). */
  clipArtifactId: z.string().optional(),
});
const Storyboard = z.object({
  storyboard: z.array(Shot).min(1),
  voiceover: z.string(),
  /** The ad's on-screen headline and tagline (spec §3.3), when the storyboard has them. */
  headline: z.string().optional(),
  tagline: z.string().optional(),
});

export type StoryboardShot = z.infer<typeof Shot>;

export interface StoryboardModel {
  shots: StoryboardShot[];
  voiceover: string;
  totalSec: number;
  headline?: string;
  tagline?: string;
}

export function parseStoryboard(text: string): StoryboardModel | null {
  const parsed = Storyboard.safeParse(json(text));
  if (!parsed.success) return null;
  const shots = parsed.data.storyboard.map((s) => ({
    shot: s.shot,
    description: s.description,
    imagePrompt: s.imagePrompt,
    durationSec: s.durationSec,
    ...(s.caption?.trim() ? { caption: s.caption } : {}),
    ...(s.imageArtifactId ? { imageArtifactId: s.imageArtifactId } : {}),
    ...(s.clipArtifactId ? { clipArtifactId: s.clipArtifactId } : {}),
  }));
  const { headline, tagline } = parsed.data;
  return {
    shots,
    voiceover: parsed.data.voiceover,
    totalSec: shots.reduce((t, s) => t + s.durationSec, 0),
    ...(headline?.trim() ? { headline } : {}),
    ...(tagline?.trim() ? { tagline } : {}),
  };
}

/** Every artifact a storyboard shows (frames and clips), so the server can say what media type each one is. */
export function storyboardArtifacts(board: StoryboardModel): string[] {
  return board.shots.flatMap((s) => [s.imageArtifactId, s.clipArtifactId].filter((id): id is string => id !== undefined));
}

/**
 * How a clip is shown: a real clip (video/*) plays in a video element; the demo's labelled placeholder
 * (image/svg+xml, contracts VideoResult) is an image, so it is shown as one.
 */
export function clipKind(mediaType: string | undefined): 'video' | 'image' | 'link' {
  const type = mediaType?.split(';')[0]?.trim() ?? '';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';
  return 'link';
}
