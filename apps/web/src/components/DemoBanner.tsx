'use client';

/**
 * "Demo mode — sample outputs, no AI calls." on every screen while byway is in demo mode (spec §5 "Demo mode"). It starts
 * from the server's mode. The root layout outlives page changes and demo mode can change in another tab, so, as the
 * sandbox banner does, it reads the mode again (GET /api/mode) on every navigation and every few seconds while the
 * tab is visible (B-199's check: a banner drawn once said no AI calls over a screen that spent). A failed read keeps the
 * banner it has.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { get } from './api.ts';
import { usePolling, useRefresher } from './useRefresher.ts';

const REFRESH_MS = 5000;

export function DemoBanner({ demo: drawn }: { demo: boolean }) {
  const pathname = usePathname();
  const [demo, setDemo] = useState(drawn);
  // The layout drawn again (this tab saved Settings) brings the mode as it is now.
  useEffect(() => setDemo(drawn), [drawn]);
  const refresher = useRefresher(
    pathname,
    (signal) => get<{ mode?: unknown }>('/api/mode', signal),
    (settings) => {
      if (settings.mode === 'demo' || settings.mode === 'live') setDemo(settings.mode === 'demo');
    },
    () => undefined,
  );
  usePolling(refresher, REFRESH_MS);
  if (!demo) return null;
  return (
    <div className="demo-banner" role="note">
      <p>
        Demo mode — sample outputs, no AI calls. <Link href="/settings#providers">Set up providers</Link>
      </p>
    </div>
  );
}
