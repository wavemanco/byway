'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

/** Main navigation; History carries the count of runs waiting for you. */
export function Nav({ waiting }: { waiting: number }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}>
          {link.label}
          {link.href === '/history' && waiting > 0 ? (
            <span className="count" aria-label={`${waiting} waiting for you`}>
              {waiting}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
