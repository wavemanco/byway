'use client';

import Link from 'next/link';

/** A screen failed to load. Say so plainly and offer the two ways forward. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page">
      <div className="empty" role="alert">
        <h1>This screen did not load</h1>
        <p>byway hit a problem while preparing it. Your runs are not affected. Try again, or go back to Start.</p>
        <div className="empty-actions">
          <button type="button" className="button button-primary" onClick={reset}>
            Try again
          </button>
          <Link className="button" href="/">
            Go to Start
          </Link>
        </div>
      </div>
    </div>
  );
}
