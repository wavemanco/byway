'use client';

import { useState } from 'react';

const WIDTHS = { desktop: '100%', phone: '390px' } as const;

/**
 * A finished page, live: scripts run, but the iframe has no allow-same-origin, so the page runs in an opaque
 * origin and cannot reach byway or its data (the artifact route adds a sandboxing CSP as well).
 */
export function PageResult({ src, title }: { src: string; title: string }) {
  const [width, setWidth] = useState<keyof typeof WIDTHS>('desktop');
  return (
    <div className="page-result">
      <div className="segmented" role="group" aria-label="Preview width">
        <button type="button" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}>
          Desktop
        </button>
        <button type="button" aria-pressed={width === 'phone'} onClick={() => setWidth('phone')}>
          Phone
        </button>
      </div>
      <div className="page-frame" data-width={width}>
        <iframe src={src} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ width: WIDTHS[width] }} />
      </div>
    </div>
  );
}
