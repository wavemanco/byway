import type { ArtifactInfo } from '../view/rundata.ts';
import { parseOptions, parseStoryboard } from '../view/result.ts';
import { DiffView } from './DiffView.tsx';
import { Markdown } from './Markdown.tsx';
import { OptionsList, OptionTitles, Storyboard } from './results.tsx';

/**
 * How much of a text a view has (F13, ADR-0086): all of it; a snippet by design (a thumbnail, a card); or the excerpt
 * of a large view while the whole text loads, or after it failed to.
 */
export type Completeness = 'whole' | 'snippet' | 'loading' | 'failed';

interface TextPreviewProps {
  type: string;
  text: string;
  size: 'thumb' | 'large';
  completeness: Completeness;
  /** An option map's titles, counted from the whole map on the server: what a snippet of one shows. */
  titles?: string[];
  /** Media types of artifacts a storyboard shows. */
  media?: Record<string, ArtifactInfo>;
}

/**
 * A text artifact shown as its kind: a diff as a diff, an option map as a list, a storyboard as shots, prose as
 * Markdown. JSON is read only from the whole text: an excerpt of it is a fragment, never shown as if it were the data.
 */
export function TextPreview({ type, text, size, completeness, titles, media }: TextPreviewProps) {
  const whole = completeness === 'whole';
  if (type === 'text/x-diff') return <DiffView text={text} compact={size === 'thumb'} partial={!whole} />;
  if (type === 'application/json') {
    if (!whole) {
      if (titles && titles.length > 0) return <OptionTitles titles={titles} />;
      if (completeness === 'loading') return <p className="preview-loading muted">Loading the whole text…</p>;
      if (completeness === 'failed') return <p className="preview-loading muted">The whole text could not be loaded.</p>;
      return <pre className="preview-raw">{text}</pre>;
    }
    const options = parseOptions(text);
    if (options) return <OptionsList options={options} compact={size === 'thumb'} />;
    const board = size === 'large' ? parseStoryboard(text) : null;
    if (board) return <Storyboard board={board} {...(media ? { media } : {})} />;
    return <pre className="preview-raw">{text}</pre>;
  }
  return <Markdown text={text} className={size === 'thumb' ? 'prose prose-card' : 'prose'} />;
}
