'use client';

import type { RendererSettings } from '@byway/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { rendererBanner } from '../view/renderer.ts';
import { get } from './api.ts';
import { usePolling, useRefresher } from './useRefresher.ts';

const REFRESH_MS = 5000;

/** Sent on the window when this tab changed the sandbox setting (Settings' switch), so the banner reads it at once. */
const RENDERER_CHANGED = 'byway:renderer-changed';

/** Settings' switch, after a change it saved: this tab's banner reads the renderer's state again now. */
export function rendererChanged(): void {
  window.dispatchEvent(new Event(RENDERER_CHANGED));
}

/**
 * The banner every screen carries while the page renderer's OS sandbox is off, or on but unable to start at byway's last
 * start-up (ADR-0105; the words are view/renderer.ts rendererBanner's). It starts from the server's state. The root
 * layout outlives page changes, and the setting can change in another tab, so, as Nav does for the waiting count, it
 * reads the renderer's state again (GET /api/renderer) on every navigation and every few seconds while the tab is
 * visible, and at once when this tab's switch changed it. Requests go through the refresh sequencer (ADR-0082): only
 * the latest sets the banner, and a failed read keeps the banner it has.
 */
export function SandboxBanner({ renderer }: { renderer: RendererSettings }) {
  const pathname = usePathname();
  const [settings, setSettings] = useState(renderer);
  const refresher = useRefresher(
    pathname,
    (signal) => get<RendererSettings>('/api/renderer', signal),
    (s) => setSettings(s),
    () => undefined,
  );
  usePolling(refresher, REFRESH_MS);
  useEffect(() => {
    const now = () => void refresher.now();
    window.addEventListener(RENDERER_CHANGED, now);
    return () => window.removeEventListener(RENDERER_CHANGED, now);
  }, [refresher]);

  const banner = rendererBanner(settings);
  if (!banner) return null;
  return (
    <div className="sandbox-banner" data-kind={banner.kind} role="note">
      <p>
        {banner.text} <Link href="/settings#renderer">{banner.link}</Link>
      </p>
    </div>
  );
}
