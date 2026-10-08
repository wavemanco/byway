'use client';

import { useEffect, useState } from 'react';

/**
 * Copies the deliverable's text; the label confirms what happened, then returns. With `exportUrl`, what is copied is the
 * export (the same as Download): a Markdown result's images are then inline, so the copy works when pasted elsewhere
 * (EXP-1). The export is fetched inside the click, through a ClipboardItem where the browser has one, so the copy
 * keeps the click's permission.
 */
export function CopyButton({ text, exportUrl }: { text: string; exportUrl?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(t);
  }, [state]);

  async function exported(): Promise<string> {
    if (!exportUrl) return text;
    const res = await fetch(exportUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`export ${res.status}`);
    return res.text();
  }

  async function copy() {
    try {
      if (exportUrl && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        const blob = exported().then((t) => new Blob([t], { type: 'text/plain' }));
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      } else {
        await navigator.clipboard.writeText(await exported());
      }
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <button type="button" className="button" onClick={() => void copy()} aria-live="polite">
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed: use Download' : 'Copy'}
    </button>
  );
}
