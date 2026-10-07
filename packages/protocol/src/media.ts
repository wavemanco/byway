/**
 * What a configuration produces. It decides the artifact format, how a "view" is rendered for judges (02 §3:
 * the artifact as the audience experiences it) and how the product presents the output.
 */
export const MEDIA = ['web-page', 'prose', 'options', 'media', 'code-diff'] as const;
export type Medium = (typeof MEDIA)[number];

export const MEDIUM_FORMAT: Record<Medium, { artifactMediaType: string; view: 'screenshots' | 'text' }> = {
  /** A single-file HTML page; judges see full-page screenshots. */
  'web-page': { artifactMediaType: 'text/html', view: 'screenshots' },
  /** Markdown prose; judges see the clean text as published. */
  prose: { artifactMediaType: 'text/markdown', view: 'text' },
  /** A JSON list of options (C2); judges see the rendered list. */
  options: { artifactMediaType: 'application/json', view: 'text' },
  /** A storyboard (JSON) plus generated images and clips (C5); judges see the frames. */
  media: { artifactMediaType: 'application/json', view: 'screenshots' },
  /** A unified diff plus a short "why" (C7); the reviewer's view is the diff itself (C7 declared exception). */
  'code-diff': { artifactMediaType: 'text/x-diff', view: 'text' },
};
