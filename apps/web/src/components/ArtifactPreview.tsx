'use client';

import type { ArtifactInfo } from '../view/rundata.ts';
import { parseOptions, parseStoryboard } from '../view/result.ts';
import { artifactUrl } from './api.ts';
import { DiffView } from './DiffView.tsx';
import { Markdown } from './Markdown.tsx';
import { OptionsList, Storyboard } from './results.tsx';
import { ScaledPage } from './ScaledPage.tsx';

interface PreviewProps {
  id: string;
  info: ArtifactInfo | undefined;
  title: string;
  /** thumb: contact sheets and step rows; large: compare and the working view. */
  size?: 'thumb' | 'large';
  interactive?: boolean;
  /** Media types of artifacts a storyboard shows (frames and clips), when the caller knows them. */
  media?: Record<string, ArtifactInfo>;
}

/** Shows any artifact the way it is meant to be seen: a page rendered, text read, a diff as a diff. */
export function ArtifactPreview({ id, info, title, size = 'thumb', interactive = false, media }: PreviewProps) {
  const type = info?.mediaType ?? '';
  if (type === 'text/html') {
    return <ScaledPage src={artifactUrl(id)} title={title} interactive={interactive} virtualHeight={size === 'thumb' ? 860 : 900} />;
  }
  if (type.startsWith('image/')) {
    return <img className="preview-image" src={artifactUrl(id)} alt={title} loading="lazy" />;
  }
  if (type.startsWith('video/')) {
    return <video className="preview-image" src={artifactUrl(id)} controls preload="metadata" aria-label={title} />;
  }
  const text = info?.text;
  if (text !== undefined) {
    if (type === 'text/x-diff') return <DiffView text={text} compact={size === 'thumb'} />;
    if (type === 'application/json') {
      const options = parseOptions(text);
      if (options) return <OptionsList options={options} compact={size === 'thumb'} />;
      const board = size === 'large' ? parseStoryboard(text) : null;
      if (board) return <Storyboard board={board} {...(media ? { media } : {})} />;
      return <pre className="preview-raw">{text}</pre>;
    }
    return <Markdown text={text} className={size === 'thumb' ? 'prose prose-card' : 'prose'} />;
  }
  return (
    <a href={artifactUrl(id)} target="_blank" rel="noopener noreferrer">
      Open {title}
    </a>
  );
}
