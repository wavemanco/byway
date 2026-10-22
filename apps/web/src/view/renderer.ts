/**
 * The page renderer's OS sandbox as the app shows it (ADR-0105). byway draws pages, and the images in the cards a
 * reviewing model sees, in Playwright's Chromium, inside its OS sandbox unless the person switched it off in Settings.
 * - The banner every screen carries while the sandbox is off, and while it is on but byway's last start-up check found
 *   it could not start (then byway cannot draw pages).
 * - What Settings says the last start-up check found: why on this computer and the fix when the sandbox could not start,
 *   and, while it is off, the offer to turn it back on when it could.
 * byway never switches the sandbox by itself; the offer is a button the person presses.
 */
import type { RendererSettings } from '@byway/contracts';

/**
 * What turning the sandbox off risks, said plainly before it is turned off, as the design the owner approved on
 * 2026-10-16 has it; the words are Claude's (ADR-0105 item 6).
 */
export const OFF_RISK =
  'With the sandbox off, a malicious page or image, together with a bug in Chromium, could run as you on this computer, next to your API keys and spending records. byway shows a banner on every screen while it is off.';

export interface RendererBanner {
  kind: 'off' | 'cannot-start';
  text: string;
  /** The words of the link to Settings' Page renderer section. */
  link: string;
}

/** The banner every screen shows, or null when there is nothing to say. */
export function rendererBanner(s: RendererSettings): RendererBanner | null {
  if (!s.osSandbox) return { kind: 'off', text: "The page renderer's OS sandbox is off, so pages and images byway draws run without it.", link: 'Page renderer settings' };
  if (s.lastCheck?.sandbox === 'fails') return { kind: 'cannot-start', text: "byway cannot draw pages: at its last start-up, the page renderer's OS sandbox could not start on this computer.", link: 'How to fix it' };
  return null;
}

/**
 * What a screen reader is told when the banner appears, changes or goes while the person stays on a screen (D2 left
 * (9)): the new banner's own words, or, when it goes, what that means. Null when the banner is as it was.
 */
export function rendererBannerNews(before: RendererBanner | null, after: RendererBanner | null): string | null {
  if ((before?.kind ?? null) === (after?.kind ?? null)) return null;
  if (after) return after.text;
  return before?.kind === 'off' ? "The page renderer's OS sandbox is on again." : "byway no longer reports that the page renderer's OS sandbox cannot start.";
}

/**
 * What the banner's polite status says (D2 left (9)). The banner a tab first renders is read where it stands, before the
 * header, so it is not announced. After that, each read of the renderer's state that shows the banner appearing,
 * changing or going is announced, except one this tab's own Settings switch caused: Settings' own status already says
 * what changed, and the banner would say it a second time.
 */
export interface BannerAnnouncer {
  /** A read of the renderer's state: the sentence to announce, or null to leave the status as it is. */
  read(settings: RendererSettings): string | null;
  /**
   * This tab's switch saved `settings`: a read that shows them is not news. Returns what the status says now: nothing,
   * so a stale sentence is not left behind, and the next one is announced even if it repeats an earlier one.
   */
  switched(settings: RendererSettings): string;
}

export function bannerAnnouncer(initial: RendererSettings): BannerAnnouncer {
  let known = rendererBanner(initial);
  return {
    read(settings) {
      const next = rendererBanner(settings);
      const news = rendererBannerNews(known, next);
      known = next;
      return news;
    },
    switched(settings) {
      known = rendererBanner(settings);
      return '';
    },
  };
}

export interface RendererFinding {
  tone: 'plain' | 'caution';
  text: string;
  /** When the sandbox could not start: why on this computer, and the fix. */
  why?: string;
  fix?: string;
  /** Said after the fix (what it means while the sandbox is on). */
  after?: string;
}

/** What Settings says byway's last start-up check found, and whether to offer to turn the sandbox back on. */
export function rendererFindings(s: RendererSettings): { found: RendererFinding | null; offerOn: boolean } {
  const check = s.lastCheck;
  if (!check) return { found: null, offerOn: false };
  if (check.sandbox === 'fails') {
    const found: RendererFinding = { tone: 'caution', text: "At byway's last start-up, the OS sandbox could not start on this computer.", ...(check.why ? { why: check.why } : {}), ...(check.fix ? { fix: check.fix } : {}) };
    return { found: s.osSandbox ? { ...found, after: 'Until it can, byway cannot draw pages.' } : found, offerOn: false };
  }
  if (check.sandbox === 'starts') {
    return s.osSandbox
      ? { found: { tone: 'plain', text: "At byway's last start-up, the page renderer drew a test page inside its OS sandbox." }, offerOn: false }
      : { found: { tone: 'plain', text: "At byway's last start-up, the OS sandbox could start on this computer." }, offerOn: true };
  }
  // The check had not found out, by the time byway printed its line, whether the renderer is ready.
  if (check.ready === undefined) return check.message ? { found: { tone: 'caution', text: `At byway's last start-up, the page renderer was not checked in time: ${check.message}` }, offerOn: false } : { found: null, offerOn: false };
  if (!check.ready && check.message) return { found: { tone: 'caution', text: `At byway's last start-up, the page renderer was not ready: ${check.message}` }, offerOn: false };
  // Ready without the sandbox, and the probe with it had not answered in time.
  if (check.ready && !check.osSandbox) return { found: { tone: 'plain', text: "At byway's last start-up, byway could not tell whether the OS sandbox can start on this computer." }, offerOn: false };
  return { found: null, offerOn: false };
}
