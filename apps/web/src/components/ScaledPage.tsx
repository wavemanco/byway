'use client';

import { useLayoutEffect, useRef, useState } from 'react';

interface ScaledPageProps {
  src: string;
  title: string;
  /** The width the page is laid out at before scaling (a desktop viewport by default). */
  virtualWidth?: number;
  virtualHeight?: number;
  /** Interactive previews can be scrolled and used; thumbnails are pictures only. */
  interactive?: boolean;
}

/**
 * A generated page shown at desktop width, scaled to fit its box, in a sandboxed iframe: scripts may run,
 * but without the app's origin (no allow-same-origin), so the page cannot reach byway or its data. A thumbnail
 * is a picture: it takes no pointer events or focus, and shows no scrollbars.
 */
export function ScaledPage({ src, title, virtualWidth = 1280, virtualHeight = 800, interactive = false }: ScaledPageProps) {
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
        src={src}
        title={title}
        sandbox="allow-scripts"
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
