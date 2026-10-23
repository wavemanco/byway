/**
 * When byway's prices were last checked, as Settings and the Recommendation's estimated cost show it (PRICE-CADENCE,
 * block 2), at the owner's answer of 2026-10-21 23:15, "Weekly report + monthly re-read + date in the app
 * (Recommended)": "Settings and the estimate show when prices were last checked, with a notice after about 45 days."
 * The day is the gateway's PRICES_CHECKED, read on the server (the client components do not import @byway/gateway)
 * and put in words with the server's clock. Every clock here is fixed: no test reads the wall clock. The two screens
 * are rendered whole, on the real services in demo mode, with Next.js's router stood in for (they only refresh it).
 */
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRICES_CHECKED } from '@byway/gateway';
import { PricesStaleNotice } from '../src/components/PricesChecked.tsx';
import { createIntake, type Deps } from '../src/server/api.ts';
import type { Context } from '../src/services/index.ts';
import { pricesChecked, PRICES_STALE_DAYS, type PricesChecked } from '../src/view/prices.ts';
import { testHost, type TestHost } from './fixtures/services.ts';

const swapped = vi.hoisted(() => ({ deps: undefined as Deps | undefined, context: undefined as Context | undefined }));
vi.mock('../src/server/deps.ts', () => ({
  getDeps: async () => {
    if (!swapped.deps) throw new Error('no test deps');
    return swapped.deps;
  },
}));
vi.mock('../src/services/index.ts', () => ({
  getContext: async () => {
    if (!swapped.context) throw new Error('no test context');
    return swapped.context;
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));

const { default: RecommendPage } = await import('../app/recommend/[intakeId]/page.tsx');
const { default: SettingsPage } = await import('../app/settings/page.tsx');

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const LINE = 'Prices last checked Oct 22, 2026.';
const STALE = "byway's prices were last checked against the providers' pages 46 days ago, on Oct 22, 2026, and providers change their prices. Until they are checked again, estimates and the costs byway records may differ from your provider's bill.";
/** As React writes text into markup. */
const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');

describe('when prices were last checked, in words', () => {
  it('names the day, with no notice through the 45th day after it', () => {
    expect(PRICES_STALE_DAYS).toBe(45);
    for (const now of ['2026-10-22', '2026-11-01', '2026-12-06']) expect(pricesChecked('2026-10-22', day(now)), now).toEqual({ text: LINE, notice: null });
  });

  it('adds a notice from the 46th day: how long ago, and what it means for estimates and recorded costs', () => {
    expect(pricesChecked('2026-10-22', day('2026-12-07'))).toEqual({ text: LINE, notice: STALE });
    expect(pricesChecked('2026-10-22', new Date('2026-12-07T00:00:00.000Z')).notice).toBe(STALE);
    expect(pricesChecked('2026-10-22', new Date('2026-12-06T23:59:59.999Z')).notice).toBeNull();
    expect(pricesChecked('2026-10-22', day('2027-03-01')).notice).toMatch(/^byway's prices were last checked against the providers' pages 130 days ago, on Oct 22, 2026,/);
  });

  it('counts whole days in UTC, as the server and the browser both read them, and a clock behind the day as no age', () => {
    expect(pricesChecked('2026-10-22', new Date('2026-10-21T23:00:00.000Z'))).toEqual({ text: LINE, notice: null });
  });

  it('says it cannot tell when the day cannot be read, with a notice', () => {
    for (const bad of ['', 'soon', '2026-13-01', '2026-02-30', '2026-10-22T00:00:00Z']) {
      expect(pricesChecked(bad, day('2026-10-22')), bad).toEqual({
        text: 'byway cannot tell when its prices were last checked.',
        notice: "Providers change their prices, so estimates and the costs byway records may differ from your provider's bill.",
      });
    }
  });
});

describe('the notice on the screens', () => {
  const html = (prices: PricesChecked) => renderToStaticMarkup(createElement(PricesStaleNotice, { prices }));

  it('is not there while the day is recent', () => {
    expect(html({ text: LINE, notice: null })).toBe('');
  });

  it('is a caution once the day is old', () => {
    expect(html({ text: LINE, notice: STALE })).toBe(`<p class="notice notice-caution prices-stale">${escaped(STALE)}</p>`);
  });
});

let current: TestHost | undefined;

afterEach(async () => {
  await current?.dispose();
  current = undefined;
  swapped.deps = undefined;
  swapped.context = undefined;
  vi.useRealTimers();
});

/** Real services on a temp data directory, in demo mode, as the page test has them. */
async function services() {
  current = testHost();
  const { host } = current;
  const s = host.services(true);
  const ws = await s.store.ensureDefaultWorkspace();
  return { host, services: s, workspaceId: ws.id };
}

/** The screen a page renders: the element among its children that carries the prices. */
function screenOf(page: unknown): ReactElement<{ prices?: PricesChecked }> {
  const kids = isValidElement(page) ? (page.props as { children?: unknown }).children : undefined;
  const view = (Array.isArray(kids) ? kids : [kids]).find((c) => isValidElement(c) && (c.props as { prices?: unknown }).prices !== undefined);
  if (!isValidElement(view)) throw new Error('the page rendered no screen with prices');
  return view as ReactElement<{ prices?: PricesChecked }>;
}

describe("the gateway's day reaches both screens from the server", { timeout: 30_000 }, () => {
  it('the service host reads it from @byway/gateway', async () => {
    const { host } = await services();
    expect(host.pricesCheckedOn).toBe(PRICES_CHECKED);
  });

  it("the Recommendation shows it under the estimated cost, read with the server's clock, and the notice once it is old", async () => {
    const { host, services: s, workspaceId } = await services();
    swapped.deps = { services: s, workspaceId, profileId: 'demo', heldKeyIn: host.heldKeyIn, questionEstimates: host.questionEstimates, pricesCheckedOn: '2026-10-22' };
    const { intakeId } = await createIntake(swapped.deps, { text: 'Tighten my quarterly memo' });
    vi.useFakeTimers({ toFake: ['Date'] });
    for (const [now, notice] of [
      ['2026-12-06', null],
      ['2026-12-07', STALE],
    ] as const) {
      vi.setSystemTime(day(now));
      // A recipe chosen from the Library: the screen shows its proposal, and the estimate, at once.
      const view = screenOf(await RecommendPage({ params: Promise.resolve({ intakeId }), searchParams: Promise.resolve({ recipe: 'c4' }) } as never));
      expect(view.props.prices, now).toEqual({ text: LINE, notice });
      const html = renderToStaticMarkup(view);
      expect(html, now).toMatch(new RegExp(`<dt>Estimated cost</dt><dd>[^]*?<span class="facts-sub">${LINE.replace(/\./g, '\\.')}</span></dd>`));
      if (notice) expect(html).toContain(`<p class="notice notice-caution prices-stale">${escaped(STALE)}</p>`);
      else expect(html).not.toContain('prices-stale');
    }
  });

  it("Settings shows it with the workspace budget, read with the server's clock, and the notice once it is old", async () => {
    const { host, services: s, workspaceId } = await services();
    const preferences = await s.store.getPreferences(workspaceId);
    swapped.context = { services: s, workspaceId, profileId: 'demo', preferences, demoForced: true, heldKeyIn: host.heldKeyIn, questionEstimates: host.questionEstimates, pricesCheckedOn: '2026-10-22' };
    vi.useFakeTimers({ toFake: ['Date'] });
    for (const [now, notice] of [
      ['2026-12-06', null],
      ['2026-12-07', STALE],
    ] as const) {
      vi.setSystemTime(day(now));
      const view = screenOf(await SettingsPage());
      expect(view.props.prices, now).toEqual({ text: LINE, notice });
      const budget = /<section class="settings-section" aria-labelledby="[^"]*-budget">[^]*?<\/section>/.exec(renderToStaticMarkup(view))?.[0] ?? '';
      expect(budget, now).toContain(`<p class="muted small prices-checked">${LINE}</p>`);
      if (notice) expect(budget).toContain(`<p class="notice notice-caution prices-stale">${escaped(STALE)}</p>`);
      else expect(budget).not.toContain('prices-stale');
    }
  });
});
