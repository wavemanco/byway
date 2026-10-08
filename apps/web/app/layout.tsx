import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Nav } from '../src/components/Nav.tsx';
import { TechNamesProvider } from '../src/components/TechNames.tsx';
import { getContext } from '../src/services/index.ts';
import { TECHNICAL_COOKIE } from '../src/view/prefs.ts';
import { waitingRunCount } from '../src/view/run.ts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/run.css';

export const metadata: Metadata = {
  title: { default: 'byway', template: '%s — byway' },
  description: 'Describe what you are working on, get a recipe, and run it with AI. You do the human steps.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1c1c' },
  ],
};

/** The mark: a side road leaving the main one. The branch is drawn in the accent, which always means you. */
function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 22V2" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" fill="none" />
      <path d="M7 15c0-5 4-6.5 7.5-6.5S20 6 20 2.5" stroke="var(--you)" strokeWidth="2.25" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const technical = (await cookies()).get(TECHNICAL_COOKIE)?.value === '1';
  const { services, workspaceId } = await getContext();
  const waiting = waitingRunCount(await services.store.openCheckpoints(workspaceId));
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {services.mode === 'demo' ? (
          <div className="demo-banner" role="note">
            <p>
              Demo mode — sample outputs, no AI calls. <Link href="/settings#providers">Set up providers</Link>
            </p>
          </div>
        ) : null}
        <header className="app-header">
          <div className="app-header-inner">
            <Link href="/" className="wordmark" aria-label="byway, start">
              <Mark />
              <span className="wordmark-text">byway</span>
            </Link>
            <Nav waiting={waiting} />
          </div>
        </header>
        <TechNamesProvider value={technical}>
          <main id="main" tabIndex={-1}>
            {children}
          </main>
        </TechNamesProvider>
      </body>
    </html>
  );
}
