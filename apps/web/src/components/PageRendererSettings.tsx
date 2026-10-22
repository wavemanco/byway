'use client';

import type { RendererSettings } from '@byway/contracts';
import { useId, useRef, useState } from 'react';
import { OFF_RISK, rendererFindings } from '../view/renderer.ts';
import { ActionButton } from './ActionButton.tsx';
import { patch } from './api.ts';
import { rendererChanged } from './SandboxBanner.tsx';
import { Switch } from './Switch.tsx';
import { useAction } from './useAction.ts';

interface Props {
  /** The renderer's settings and what byway's last start-up check found (Store.getRendererSettings; ADR-0105). */
  settings: RendererSettings;
}

/** SandboxOffConfirm's props: the id its risk is given, whether the change is saving, and the two answers. */
interface ConfirmProps {
  /** The id the risk is given. */
  riskId: string;
  busy: boolean;
  onTurnOff: () => void;
  onKeep: () => void;
}

/**
 * Asked before the sandbox is turned off: the question, what it risks, and the two answers, "Keep it on" taking focus.
 * Both answers are described by the risk, so a screen reader reads it with whichever has focus; the group, named by its
 * question, is not, or the risk would be read twice as focus enters it.
 */
export function SandboxOffConfirm({ riskId, busy, onTurnOff, onKeep }: ConfirmProps) {
  return (
    <div className="confirm-inline renderer-confirm" role="group" aria-label="Turn the OS sandbox off?">
      <p>
        Turn the sandbox off? <span id={riskId}>{OFF_RISK}</span>
      </p>
      <div className="renderer-confirm-actions">
        <ActionButton className="button button-danger" onClick={onTurnOff} busy={busy} aria-describedby={riskId}>
          Turn it off
        </ActionButton>
        <button type="button" className="button button-quiet" onClick={onKeep} aria-describedby={riskId} autoFocus>
          Keep it on
        </button>
      </div>
    </div>
  );
}

/**
 * Settings' "Page renderer" (ADR-0105): the OS sandbox the renderer's Chromium runs inside, on unless the person switches
 * it off here, the only place it is switched. Turning it off asks first and says what it risks; turning it on does not
 * ask. What byway's last start-up check found is said under it: why the sandbox cannot start on this computer and the
 * fix, or, while it is off and it could start, an offer to turn it back on. byway never switches it by itself.
 *
 * Focus (R5): the switch keeps focus while it saves; the confirmation takes focus on "Keep it on", and when it goes,
 * either way, focus goes back to the switch, as it does from the offer once the sandbox is back on. A screen reader
 * hears the risk with whichever answer has focus (SandboxOffConfirm).
 */
export function PageRendererSettings({ settings: initial }: Props) {
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
      const saved = await patch<RendererSettings>('/api/renderer', { osSandbox });
      setSettings(saved);
      setConfirming(false);
      setSaid(osSandbox ? 'The OS sandbox is on.' : 'The OS sandbox is off.');
      backToSwitch();
      // The banner every screen shows reads the new state now (other tabs read it within a few seconds). It does not
      // announce it as well: the status above has just said it.
      rendererChanged(saved);
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
        <SandboxOffConfirm
          riskId={`${ids}-renderer-risk`}
          busy={switching.busy}
          onTurnOff={() => turn(false)}
          onKeep={() => {
            setConfirming(false);
            backToSwitch();
          }}
        />
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
