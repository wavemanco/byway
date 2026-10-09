'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { frameSandbox } from '../view/pages.ts';
import { pageFrameUrl } from './api.ts';

interface ScaledPageProps {
  /** The page's artifact id: the frame's address and its sandbox both follow `scripts` (pageFrameUrl, frameSandbox). */
  id: string;
  title: string;
  /** The width the page is laid out at before scaling (a desktop viewport by default). */
  virtualWidth?: number;
  virtualHeight?: number;
  /** Interactive previews can be scrolled and used; thumbnails are pictures only. */
  interactive?: boolean;
  /** Run the page's scripts (SEC-4): only once the person turned them on for this page, never for thumbnails. */
  scripts?: boolean;
}

/**
 * A generated page shown at desktop width, scaled to fit its box, in a sandboxed iframe without the app's origin (no
 * allow-same-origin), so the page cannot reach byway or its data. Its scripts run only when `scripts` is set: a
 * page's CSP blocks every request but one, navigating itself, and with scripts it can do that the moment it is
 * shown, carrying what it holds in the address (SEC-4). So `scripts` comes from a per-page switch, never a setting, and
 * the same switch picks the address: the server grants scripts only to a frame that asks with `?scripts=1` (F05). A
 * thumbnail is a picture: it takes no pointer events or focus, and shows no scrollbars.
 */
export function ScaledPage({ id, title, virtualWidth = 1280, virtualHeight = 800, interactive = false, scripts = false }: ScaledPageProps) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / virtualWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [virtualWidth]);

  return (
    <div ref={box} className={interactive ? 'scaled scaled-live' : 'scaled'} style={{ aspectRatio: `${virtualWidth} / ${virtualHeight}` }}>
      <iframe
        // A sandbox applies when a frame loads, so turning scripts on or off loads the page again.
        key={scripts ? 'scripts' : 'static'}
        src={pageFrameUrl(id, scripts)}
        title={title}
        sandbox={frameSandbox(scripts)}
        referrerPolicy="no-referrer"
        loading="lazy"
        tabIndex={interactive ? 0 : -1}
        scrolling={interactive ? undefined : 'no'}
        aria-hidden={interactive ? undefined : true}
        style={{ width: virtualWidth, height: virtualHeight, transform: `scale(${scale})` }}
      />
    </div>
  );
}
