/**
 * The page renderer's OS sandbox as the app shows it (ADR-0105): the banner every screen carries while it is off, or
 * while it is on and byway's last start-up check found it could not start; and what Settings says the check found,
 * with the offer to turn it back on when it could start. The words are checked whole: they must be true of the code.
 */
import { describe, expect, it } from 'vitest';
import type { RendererCheckRecord, RendererSettings } from '@byway/contracts';
import { OFF_RISK, rendererBanner, rendererFindings } from '../src/view/renderer.ts';

const AT = '2026-10-18T14:00:00.000Z';
const starts: RendererCheckRecord = { at: AT, osSandbox: true, ready: true, sandbox: 'starts' };
const fails: RendererCheckRecord = {
  at: AT,
  osSandbox: true,
  ready: false,
  sandbox: 'fails',
  message: 'The page renderer could not start inside its OS sandbox on this computer, so pages cannot be drawn. byway is running as root. Start byway as an ordinary user.',
  why: 'byway is running as root, and Chromium does not start its sandbox for root.',
  fix: 'Start byway as an ordinary user.',
};
const on = (lastCheck?: RendererCheckRecord): RendererSettings => ({ osSandbox: true, ...(lastCheck ? { lastCheck } : {}) });
const off = (lastCheck?: RendererCheckRecord): RendererSettings => ({ osSandbox: false, changedAt: AT, ...(lastCheck ? { lastCheck } : {}) });

describe('the banner on every screen', () => {
  it('is there whenever the sandbox is off, whatever the check found', () => {
    for (const s of [off(), off(starts), off({ ...fails, osSandbox: false, ready: true })]) {
      expect(rendererBanner(s)).toEqual({ kind: 'off', text: "The page renderer's OS sandbox is off, so pages and images byway draws run without it.", link: 'Page renderer settings' });
    }
  });

  it('says byway cannot draw pages while the sandbox is on and the last start-up check found it could not start', () => {
    expect(rendererBanner(on(fails))).toEqual({ kind: 'cannot-start', text: "byway cannot draw pages: at its last start-up, the page renderer's OS sandbox could not start on this computer.", link: 'How to fix it' });
  });

  it('is not there while the sandbox is on and nothing says it cannot start', () => {
    for (const s of [on(), on(starts), on({ at: AT, osSandbox: true, ready: false, sandbox: 'unknown', message: 'Chromium is missing.' })]) expect(rendererBanner(s)).toBeNull();
  });
});

describe('what Settings says the last start-up check found', () => {
  it('nothing before the first check', () => {
    expect(rendererFindings(on())).toEqual({ found: null, offerOn: false });
    expect(rendererFindings(off())).toEqual({ found: null, offerOn: false });
  });

  it('on and starting: that it drew a test page inside the sandbox', () => {
    expect(rendererFindings(on(starts))).toEqual({ found: { tone: 'plain', text: "At byway's last start-up, the page renderer drew a test page inside its OS sandbox." }, offerOn: false });
  });

  it('off, and the sandbox could start: says so and offers to turn it back on', () => {
    expect(rendererFindings(off(starts))).toEqual({ found: { tone: 'plain', text: "At byway's last start-up, the OS sandbox could start on this computer." }, offerOn: true });
    expect(rendererFindings(off({ at: AT, osSandbox: false, ready: true, sandbox: 'starts' })).offerOn).toBe(true);
  });

  it('could not start: why on this computer and the fix, whichever way it is set, and no offer', () => {
    const said = { tone: 'caution', text: "At byway's last start-up, the OS sandbox could not start on this computer.", why: fails.why, fix: fails.fix };
    expect(rendererFindings(on(fails))).toEqual({ found: { ...said, after: 'Until it can, byway cannot draw pages.' }, offerOn: false });
    expect(rendererFindings(off({ ...fails, osSandbox: false, ready: true }))).toEqual({ found: said, offerOn: false });
  });

  it('the renderer itself could not start: its message', () => {
    expect(rendererFindings(on({ at: AT, osSandbox: true, ready: false, sandbox: 'unknown', message: 'Chromium is missing.' }))).toEqual({
      found: { tone: 'caution', text: "At byway's last start-up, the page renderer could not start: Chromium is missing." },
      offerOn: false,
    });
    expect(rendererFindings(off({ at: AT, osSandbox: false, ready: true, sandbox: 'unknown' }))).toEqual({ found: null, offerOn: false });
  });
});

describe('turning the sandbox off', () => {
  it('asks with the risk in plain words, as the owner put it', () => {
    expect(OFF_RISK).toBe(
      'With the sandbox off, a malicious page or image, together with a bug in Chromium, could run as you on this computer, next to your API keys and spending records. byway shows a banner on every screen while it is off.',
    );
  });
});
