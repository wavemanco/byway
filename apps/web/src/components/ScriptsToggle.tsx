'use client';

import { useEffect, useId, useState } from 'react';

/** Where byway once remembered "Run the page's scripts" for every page; it is no longer read, and is cleared. */
const RETIRED_KEY = 'byway.pageScripts';

/**
 * Whether the generated page (or the pages compared together) named by `key` runs its scripts here (SEC-4). Off until
 * the person turns it on, and then only for that page while this screen shows it: the choice is React state, never
 * stored, so leaving or reloading the screen ends it, and another page shown in the same place (a new key) starts with
 * scripts off. A page running its scripts can navigate itself to another site, carrying what it holds in the address,
 * which no CSP can stop; so turning scripts on is a one-page, one-visit action, not a setting that runs every later
 * page's scripts the moment it is shown.
 */
export function usePageScripts(key: string): [boolean, (on: boolean) => void] {
  const [onFor, setOnFor] = useState<string | null>(null);
  useEffect(() => {
    try {
      window.localStorage.removeItem(RETIRED_KEY);
    } catch {
      // Storage may be missing or refuse (private windows, blocked site data); the key is never read either way.
    }
  }, []);
  return [onFor === key, (on: boolean) => setOnFor(on ? key : null)];
}

const RISK = 'A page running its scripts can send what it contains to other sites.';

interface ScriptsToggleProps {
  on: boolean;
  onChange(on: boolean): void;
  /** "Run the page’s scripts", or the pages’ for one switch over several (compare). */
  label?: string;
}

/**
 * The "Run the page's scripts" switch beside a generated page (SEC-4). Its note says, on or off, what scripts can do,
 * and, once on, how long it lasts. Thumbnails never run scripts and have no switch.
 */
export function ScriptsToggle({ on, onChange, label = 'Run the page’s scripts' }: ScriptsToggleProps) {
  const note = useId();
  return (
    <span className="scripts-toggle">
      <button type="button" className="button button-quiet" aria-pressed={on} aria-describedby={note} onClick={() => onChange(!on)}>
        {label}
      </button>
      <span id={note} className="scripts-note">
        {on ? `Scripts are on until you leave or reload this screen. ${RISK}` : `Scripts are off. ${RISK}`}
      </span>
    </span>
  );
}
