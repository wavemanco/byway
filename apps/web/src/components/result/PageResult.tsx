'use client';

import { useState } from 'react';
import { frameSandbox } from '../../view/pages.ts';
import { ScriptsToggle } from '../ScriptsToggle.tsx';
import { PAGE_SCRIPTS, useViewerFlag } from '../viewerFlags.ts';

const WIDTHS = { desktop: '100%', phone: '390px' } as const;

/**
 * A finished page, live. The iframe has no allow-same-origin, so the page runs in an opaque origin and cannot reach
 * byway or its data (the artifact route adds a sandboxing CSP as well). Its scripts run once you turn them on: with
 * scripts, a page could navigate itself to another site carrying what it shows, the one request its CSP cannot stop
 * (SEC-4).
 */
export function PageResult({ src, title }: { src: string; title: string }) {
  const [width, setWidth] = useState<keyof typeof WIDTHS>('desktop');
  const [scripts] = useViewerFlag(PAGE_SCRIPTS);
  return (
    <div className="page-result">
      <div className="page-result-bar">
        <div className="segmented" role="group" aria-label="Preview width">
          <button type="button" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}>
            Desktop
          </button>
          <button type="button" aria-pressed={width === 'phone'} onClick={() => setWidth('phone')}>
            Phone
          </button>
        </div>
        <ScriptsToggle />
      </div>
      <div className="page-frame" data-width={width}>
        {/* A sandbox applies when a frame loads, so turning scripts on or off loads the page again. */}
        <iframe key={scripts ? 'scripts' : 'static'} src={src} title={title} sandbox={frameSandbox(scripts)} referrerPolicy="no-referrer" style={{ width: WIDTHS[width] }} />
      </div>
    </div>
  );
}
