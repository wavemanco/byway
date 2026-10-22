'use client';

import type { RendererSettings } from '@byway/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { bannerAnnouncer, rendererBanner } from '../view/renderer.ts';
import { get } from './api.ts';
import { usePolling, useRefresher } from './useRefresher.ts';

const REFRESH_MS = 5000;

/** Sent on the window when this tab changed the sandbox setting (Settings' switch), so the banner reads it at once. */
const RENDERER_CHANGED = 'byway:renderer-changed';

/**
 * Settings' switch, after a change it saved (`settings`, as the server answered): this tab's banner reads the renderer's
 * state again now, and does not announce what the switch's own status already said.
 */
export function rendererChanged(settings: RendererSettings): void {
  window.dispatchEvent(new CustomEvent<RendererSettings>(RENDERER_CHANGED, { detail: settings }));
}

/**
 * The banner every screen carries while the page renderer's OS sandbox is off, or on but unable to start at byway's last
 * start-up (ADR-0105; the words are view/renderer.ts rendererBanner's). It starts from the server's state. The root
 * layout outlives page changes, and the setting can change in another tab, so, as Nav does for the waiting count, it
 * reads the renderer's state again (GET /api/renderer) on every navigation and every few seconds while the tab is
 * visible, and at once when this tab's switch changed it. Requests go through the refresh sequencer (ADR-0082): only
 * the latest sets the banner, and a failed read keeps the banner it has.
 *
 * The banner is a note, read where it stands; a polite status beside it, always there, says when it appears, changes or
 * goes while the person stays on a screen, except for this tab's own switch (bannerAnnouncer; D2 left (9)).
 */
export function SandboxBanner({ renderer }: { renderer: RendererSettings }) {
  const pathname = usePathname();
  const [settings, setSettings] = useState(renderer);
  const [announcer] = useState(() => bannerAnnouncer(renderer));
  const [news, setNews] = useState('');
  const refresher = useRefresher(
    pathname,
    (signal) => get<RendererSettings>('/api/renderer', signal),
    (s) => {
      setSettings(s);
      const said = announcer.read(s);
      if (said !== null) setNews(said);
    },
    () => undefined,
  );
  usePolling(refresher, REFRESH_MS);
  useEffect(() => {
    const now = (event: Event) => {
      const saved = (event as CustomEvent<RendererSettings | undefined>).detail;
      if (saved) setNews(announcer.switched(saved));
      void refresher.now();
    };
    window.addEventListener(RENDERER_CHANGED, now);
    return () => window.removeEventListener(RENDERER_CHANGED, now);
  }, [refresher, announcer]);

  const banner = rendererBanner(settings);
  return (
    <>
      <p className="sr-only sandbox-news" role="status" aria-live="polite">
        {news}
      </p>
      {banner ? (
        <div className="sandbox-banner" data-kind={banner.kind} role="note">
          <p>
            {banner.text} <Link href="/settings#renderer">{banner.link}</Link>
          </p>
        </div>
      ) : null}
    </>
  );
}
