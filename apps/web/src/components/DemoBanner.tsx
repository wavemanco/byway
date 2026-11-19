'use client';

/**
 * "Demo mode — sample outputs, no AI calls." on every screen while byway is in demo mode (spec §5 "Demo mode"). It starts
 * from the server's mode. The root layout outlives page changes and demo mode can change in another tab, so, as the
 * sandbox banner does, it reads the mode again (GET /api/mode) on every navigation and every few seconds while the tab is
 * visible, and at once when the layout is drawn again (this tab saved Settings) (B-199's checks: a banner drawn once said
 * no AI calls over a screen that spent). On a run's screen it asks about that run too: a run keeps the models it started
 * with, so one started with real models is said to use them. A failed read keeps the banner it has.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { get } from './api.ts';
import { usePolling, useRefresher } from './useRefresher.ts';

const REFRESH_MS = 5000;

/** The run a screen shows, from its address (/runs/<id>, and the screens under it). */
const runOf = (pathname: string | null): string | undefined => /^\/runs\/([^/?#]+)/.exec(pathname ?? '')?.[1];

interface Mode {
  mode?: unknown;
  runUsesRealModels?: unknown;
}

export function DemoBanner({ demo: drawn }: { demo: boolean }) {
  const pathname = usePathname();
  const run = runOf(pathname);
  const [demo, setDemo] = useState(drawn);
  const [realRun, setRealRun] = useState(false);
  const refresher = useRefresher(
    pathname,
    (signal) => get<Mode>(run ? `/api/mode?run=${encodeURIComponent(run)}` : '/api/mode', signal),
    (answer) => {
      if (answer.mode !== 'demo' && answer.mode !== 'live') return;
      setDemo(answer.mode === 'demo');
      setRealRun(answer.runUsesRealModels === true);
    },
    () => undefined,
  );
  usePolling(refresher, REFRESH_MS);
  // The layout drawn again (this tab saved Settings) brings the mode as it is now; a read already on its way may be
  // older, so read again now. Only when the drawn value changes: a navigation keeps the layout, and its value, as it was.
  const latest = useRef(refresher);
  latest.current = refresher;
  useEffect(() => {
    setDemo(drawn);
    void latest.current.now();
  }, [drawn]);
  useEffect(() => setRealRun(false), [run]);
  if (!demo) return null;
  return (
    <div className="demo-banner" role="note">
      <p>
        {realRun ? (
          <>
            Demo mode is on for new runs; this run uses real models. <Link href="/settings">Settings</Link>
          </>
        ) : (
          <>
            Demo mode — sample outputs, no AI calls. <Link href="/settings#providers">Set up providers</Link>
          </>
        )}
      </p>
    </div>
  );
}
