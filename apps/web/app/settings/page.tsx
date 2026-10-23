import type { Metadata } from 'next';
import { SettingsView } from '../../src/components/SettingsView.tsx';
import { getContext } from '../../src/services/index.ts';
import { assumedPricingNote, workspaceSpend } from '../../src/view/history.ts';
import { pricesChecked } from '../../src/view/prices.ts';

export const metadata: Metadata = { title: 'Settings' };

/**
 * Settings (spec §5, screen 7): providers (configured or not, never the key), profile, budget, demo mode, names, the
 * spend book's records that need the person (ADR-0095), the page renderer's OS sandbox (ADR-0105), and when byway's
 * prices were last checked, put in words with the server's clock (PRICE-CADENCE).
 */
export default async function SettingsPage() {
  const { services, workspaceId, preferences, demoForced, pricesCheckedOn } = await getContext();
  const workspace = (await services.store.getWorkspace(workspaceId)) ?? (await services.store.ensureDefaultWorkspace());
  const summary = await services.gateway.spend(workspace.id);
  const records = await services.gateway.spendRecords(workspace.id);
  const spend = workspaceSpend(workspace.budgetUsd, summary);
  const renderer = await services.store.getRendererSettings();
  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>These apply to this computer’s byway workspace. Changes save as you make them.</p>
        </div>
      </div>
      <SettingsView providers={services.gateway.providers()} profiles={services.gateway.profileStatus()} preferences={preferences} spend={spend} records={records} pricingNote={assumedPricingNote(summary.assumedPricing)} mode={services.mode} demoForced={demoForced} renderer={renderer} prices={pricesChecked(pricesCheckedOn, new Date())} />
    </div>
  );
}
