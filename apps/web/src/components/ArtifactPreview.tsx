'use client';

import { partShown } from '../view/format.ts';
import type { ArtifactInfo } from '../view/rundata.ts';
import { artifactUrl, openHref } from './api.ts';
import { ScaledPage } from './ScaledPage.tsx';
import { ScriptsToggle, usePageScripts } from './ScriptsToggle.tsx';
import { TextPreview, type Completeness } from './TextPreview.tsx';
import { useWholeText } from './wholeText.ts';

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

/**
 * Shows any artifact the way it is meant to be seen: a page rendered, text read, a diff as a diff.
 *
 * Text arrives as the Run screen's excerpt (F13, ADR-0086). A thumbnail shows it as the snippet it is. A large preview
 * is a view people decide on (a compare, a reference, a step opened from the timeline), so it loads the whole text and,
 * until it has it, says that it shows only the opening, with a link to the whole.
 */
export function ArtifactPreview({ id, info, title, size = 'thumb', interactive = false, media, scripts }: PreviewProps) {
  const loaded = useWholeText(id, info, size === 'large');
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
  const excerpt = info?.excerpt;
  if (excerpt !== undefined) {
    // How much of the text the excerpt is; null when it is all of it, whatever the flag says, so a whole text never gets
    // a partial notice.
    const part = info?.complete === false ? partShown(new TextEncoder().encode(excerpt).length, info.bytes) : null;
    const completeness: Completeness =
      part === null || loaded.text !== undefined ? 'whole' : size === 'thumb' ? 'snippet' : loaded.failed ? 'failed' : 'loading';
    const preview = (
      <TextPreview type={type} text={loaded.text ?? excerpt} size={size} completeness={completeness} {...(info?.titles ? { titles: info.titles } : {})} {...(media ? { media } : {})} />
    );
    if (part === null || completeness === 'whole' || completeness === 'snippet') return preview;
    return (
      <div className="preview-partial">
        <PartialNotice id={id} title={title} part={part} failed={completeness === 'failed'} />
        {preview}
      </div>
    );
  }
  // Nothing known about it (no info yet, or a type this preview cannot show): the viewer knows what it is (F05).
  return (
    <a href={openHref(id)} target="_blank" rel="noopener noreferrer">
      Open {title}
    </a>
  );
}

/**
 * Above a large preview that shows only the opening of a text: how much of it (`part`, from partShown: sizes that differ
 * whenever something is missing), whether the rest is loading or could not be loaded, and a link to the whole text.
 */
export function PartialNotice({ id, title, part, failed }: { id: string; title: string; part: string; failed: boolean }) {
  return (
    <p className="preview-partial-note notice small">
      Showing {part}
      {failed ? '; the rest could not be loaded here. ' : ' while the rest loads. '}
      <a href={openHref(id)} target="_blank" rel="noopener noreferrer">
        Open the whole text<span className="sr-only"> of {title} in a new tab</span>
      </a>
    </p>
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
