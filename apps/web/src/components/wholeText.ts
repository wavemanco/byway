/**
 * The whole text of an artifact, for a decision view that was given only its excerpt (F13, ADR-0086): a compare, a
 * reference, a step opened from the timeline. The Run screen's polled data carries at most 16 KB of each text, so a view
 * that people decide on loads the rest once, from the artifact's own address.
 *
 * Artifacts are content-addressed, so a loaded text never goes stale: one promise per id is kept for the page's
 * lifetime and shared by every view. A failed load is forgotten, so the next view that asks tries again.
 */
import { useEffect, useState } from 'react';
import type { ArtifactInfo } from '../view/rundata.ts';
import { artifactUrl } from './api.ts';

type Fetch = (url: string) => Promise<Response>;

const loads = new Map<string, Promise<string>>();

export function loadWholeText(id: string, fetcher: Fetch = (url) => fetch(url)): Promise<string> {
  const known = loads.get(id);
  if (known) return known;
  const loading = (async () => {
    const res = await fetcher(artifactUrl(id));
    if (!res.ok) throw new Error(`The whole text could not be loaded (${res.status}).`);
    return res.text();
  })();
  loads.set(id, loading);
  loading.catch(() => {
    if (loads.get(id) === loading) loads.delete(id);
  });
  return loading;
}

/** For tests: forget every loaded text. */
export function forgetWholeTexts(): void {
  loads.clear();
}

export interface WholeText {
  /** The whole text, once loaded. */
  text?: string;
  /** The load failed; the view goes on showing the excerpt and says so. */
  failed: boolean;
}

/**
 * The whole text of `id` when `enabled` and its info says the excerpt is not the whole text; nothing otherwise. The
 * result starts empty and is set after mounting, so the server's HTML and the first render in the browser agree (both
 * show the excerpt with its partial notice).
 */
export function useWholeText(id: string, info: ArtifactInfo | undefined, enabled: boolean): WholeText {
  const wanted = enabled && info?.complete === false;
  const [state, setState] = useState<{ id: string } & WholeText>();
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    loadWholeText(id).then(
      (text) => live && setState({ id, text, failed: false }),
      () => live && setState({ id, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [id, wanted]);
  return wanted && state?.id === id ? state : { failed: false };
}
