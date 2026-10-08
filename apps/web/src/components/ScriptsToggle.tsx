'use client';

import { useId } from 'react';
import { PAGE_SCRIPTS, useViewerFlag } from './viewerFlags.ts';

/**
 * Turns a generated page's scripts on or off wherever byway shows it (SEC-4). Off by default: with scripts, a page
 * could navigate itself and carry what it shows to another site. The choice is remembered in this browser and applies
 * to every large page preview; thumbnails never run scripts.
 */
export function ScriptsToggle() {
  const [on, setOn] = useViewerFlag(PAGE_SCRIPTS);
  const note = useId();
  return (
    <span className="scripts-toggle">
      <button type="button" className="button button-quiet" aria-pressed={on} aria-describedby={note} onClick={() => setOn(!on)}>
        Run the page’s scripts
      </button>
      <span id={note} className="scripts-note">
        {on ? 'Scripts run, without access to byway.' : 'Shown without its scripts: they could send what the page shows to another site.'}
      </span>
    </span>
  );
}
