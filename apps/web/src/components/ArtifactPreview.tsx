'use client';

import type { ArtifactInfo } from '../view/rundata.ts';
import { parseOptions, parseStoryboard } from '../view/result.ts';
import { artifactUrl, openHref } from './api.ts';
import { DiffView } from './DiffView.tsx';
import { Markdown } from './Markdown.tsx';
import { OptionsList, Storyboard } from './results.tsx';
import { ScaledPage } from './ScaledPage.tsx';
import { ScriptsToggle, usePageScripts } from './ScriptsToggle.tsx';

interface PreviewProps {
  id: string;
  info: ArtifactInfo | undefined;
  title: string;
  /** thumb: contact sheets and step rows; large: compare and the working view. */
  size?: 'thumb' | 'large';
  interactive?: boolean;
  /** Media types of artifacts a storyboard shows (frames and clips), when the caller knows them. */
  media?: Record<string, ArtifactInfo>;
  /**
   * Set by a caller that shows one "Run the pages' scripts" switch for several large pages (compare); the preview then
   * shows no switch of its own. Left out, a large page preview has its own switch, off until turned on.
   */
  scripts?: boolean;
}

/** Shows any artifact the way it is meant to be seen: a page rendered, text read, a diff as a diff. */
export function ArtifactPreview({ id, info, title, size = 'thumb', interactive = false, media, scripts }: PreviewProps) {
  const type = info?.mediaType ?? '';
  if (type === 'text/html') {
    // Thumbnails are pictures and never run scripts; a large preview runs them only once asked, for that page (SEC-4).
    if (size === 'thumb') return <ScaledPage id={id} title={title} interactive={interactive} virtualHeight={860} />;
    return <LargePage id={id} title={title} interactive={interactive} scripts={scripts} />;
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
  // Nothing known about it (no info yet, or a type this preview cannot show): the viewer knows what it is (F05).
  return (
    <a href={openHref(id)} target="_blank" rel="noopener noreferrer">
      Open {title}
    </a>
  );
}

/** A large page preview with its own scripts switch, scoped to this page while it is shown, unless the caller holds one. */
function LargePage({ id, title, interactive, scripts }: { id: string; title: string; interactive: boolean; scripts: boolean | undefined }) {
  const [own, setOwn] = usePageScripts(id);
  const held = scripts !== undefined;
  return (
    <div className="page-preview">
      {held ? null : <ScriptsToggle on={own} onChange={setOwn} />}
      <ScaledPage id={id} title={title} interactive={interactive} virtualHeight={900} scripts={held ? scripts : own} />
    </div>
  );
}
