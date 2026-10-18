'use client';

import type { RendererSettings } from '@byway/contracts';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { OFF_RISK, rendererFindings } from '../view/renderer.ts';
import { ActionButton } from './ActionButton.tsx';
import { patch } from './api.ts';
import { Switch } from './Switch.tsx';
import { useAction } from './useAction.ts';

interface Props {
  /** The renderer's settings and what byway's last start-up check found (Store.getRendererSettings; ADR-0105). */
  settings: RendererSettings;
}

/**
 * Settings' "Page renderer" (ADR-0105): the OS sandbox the renderer's Chromium runs inside, on unless the person switches
 * it off here, the only place it is switched. Turning it off asks first and says what it risks; turning it on does not
 * ask. What byway's last start-up check found is said under it: why the sandbox cannot start on this computer and the
 * fix, or, while it is off and it could start, an offer to turn it back on. byway never switches it by itself.
 *
 * Focus (R5): the switch keeps focus while it saves; the confirmation takes focus on "Keep it on", and when it goes,
 * either way, focus goes back to the switch, as it does from the offer once the sandbox is back on.
 */
export function PageRendererSettings({ settings: initial }: Props) {
  const router = useRouter();
  const ids = useId();
  const [settings, setSettings] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const switchRef = useRef<HTMLButtonElement>(null);
  const backToSwitch = () => requestAnimationFrame(() => switchRef.current?.focus());

  // One change at a time; the pressed control keeps focus while it saves (R5).
  const switching = useAction(async (osSandbox: boolean) => {
    setError(null);
    setSaid(null);
    try {
      setSettings(await patch<RendererSettings>('/api/renderer', { osSandbox }));
      setConfirming(false);
      setSaid(osSandbox ? 'The OS sandbox is on.' : 'The OS sandbox is off.');
      backToSwitch();
      // The banner every screen shows is the server's: refresh it.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That was not saved. Try again.');
    }
  });
  const turn = (osSandbox: boolean) => void switching.run(osSandbox);
  const { found, offerOn } = rendererFindings(settings);

  return (
    <section className="settings-section" id="renderer" aria-labelledby={`${ids}-renderer`}>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
      <div className="setting-row">
        <div>
          <h2 id={`${ids}-renderer`}>Page renderer’s OS sandbox</h2>
          <p id={`${ids}-renderer-help`} className="muted">
            byway draws pages, and the images in the cards a reviewing model sees, in Playwright’s Chromium. With the sandbox on, a page or image that takes advantage of a bug in Chromium is
            still shut in by the sandbox. A change applies from the next page byway draws; pages being drawn finish as they started.
          </p>
        </div>
        <Switch ref={switchRef} checked={settings.osSandbox} onChange={(on) => (on ? turn(true) : setConfirming(true))} labelledBy={`${ids}-renderer`} describedBy={`${ids}-renderer-help`} busy={switching.busy} />
      </div>
      {confirming ? (
        <div className="confirm-inline renderer-confirm" role="group" aria-label="Turn the OS sandbox off?">
          <p>Turn the sandbox off? {OFF_RISK}</p>
          <div className="renderer-confirm-actions">
            <ActionButton className="button button-danger" onClick={() => turn(false)} busy={switching.busy}>
              Turn it off
            </ActionButton>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                setConfirming(false);
                backToSwitch();
              }}
              autoFocus
            >
              Keep it on
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      ) : null}
      {found ? (
        <div className={found.tone === 'caution' ? 'notice notice-caution renderer-found' : 'notice renderer-found'}>
          <p>{found.text}</p>
          {found.why ? <p>{found.why}</p> : null}
          {found.fix ? <p>{found.fix}</p> : null}
          {found.after ? <p>{found.after}</p> : null}
          {offerOn ? (
            <ActionButton className="button" onClick={() => turn(true)} busy={switching.busy}>
              Turn the sandbox back on
            </ActionButton>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
