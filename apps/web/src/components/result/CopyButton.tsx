'use client';

import { useEffect, useState } from 'react';

/** Copies the deliverable's text; the label confirms what happened, then returns. */
export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
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
