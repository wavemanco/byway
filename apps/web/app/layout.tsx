import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Nav } from '../src/components/Nav.tsx';
import { DemoBanner } from '../src/components/DemoBanner.tsx';
import { RestartedNotice } from '../src/components/RestartedNotice.tsx';
import { SandboxBanner } from '../src/components/SandboxBanner.tsx';
import { TechNamesProvider } from '../src/components/TechNames.tsx';
import { SingleKeysProvider } from '../src/components/useShortcuts.ts';
import { getContext } from '../src/services/index.ts';
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
  const { services, workspaceId, preferences } = await getContext();
  const technical = preferences.showTechnicalNames;
  const [open, runs, renderer] = await Promise.all([services.store.openCheckpoints(workspaceId), services.store.listRuns(workspaceId), services.store.getRendererSettings()]);
  const waiting = waitingRunCount(open, runs);
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {/* Read again on each screen and while the tab is in view, as the sandbox banner is (B-199). */}
        <DemoBanner demo={services.mode === 'demo'} />
        {/* On every screen while the page renderer's OS sandbox is off, or on but unable to start (ADR-0105): from the
            server's state, then read again on each navigation and while the tab is visible. */}
        <SandboxBanner renderer={renderer} />
        {/* Once any request from this tab is answered that byway started again at a new address (B-188). */}
        <RestartedNotice />
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
          <SingleKeysProvider value={preferences.singleKeyShortcuts}>
            <main id="main" tabIndex={-1}>
              {children}
            </main>
          </SingleKeysProvider>
        </TechNamesProvider>
      </body>
    </html>
  );
}
