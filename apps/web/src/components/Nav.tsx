'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { get } from './api.ts';

const LINKS = [
  { href: '/', label: 'Start' },
  { href: '/library', label: 'Library' },
  { href: '/history', label: 'History' },
  { href: '/settings', label: 'Settings' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/recommend');
  if (href === '/history') return pathname.startsWith('/history') || pathname.startsWith('/runs');
  return pathname.startsWith(href);
}

const REFRESH_MS = 5000;

/**
 * Main navigation. History carries the number of runs waiting for you; the header outlives page changes, so
 * the count refreshes itself on navigation and every few seconds while the tab is visible.
 */
export function Nav({ waiting: initial }: { waiting: number }) {
  const pathname = usePathname();
  const [waiting, setWaiting] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      get<{ count: number }>('/api/waiting')
        .then((r) => {
          if (!cancelled) setWaiting(r.count);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [pathname]);

  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}>
          {link.label}
          {link.href === '/history' && waiting > 0 ? (
            <span className="count">
              {waiting}
              <span className="sr-only"> {waiting === 1 ? 'run is' : 'runs are'} waiting for you</span>
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
