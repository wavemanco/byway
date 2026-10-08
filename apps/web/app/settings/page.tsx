import type { Metadata } from 'next';
import { SettingsView } from '../../src/components/SettingsView.tsx';
import { getContext } from '../../src/services/index.ts';
import { technicalNames } from '../../src/server/technical.ts';
import { workspaceSpend } from '../../src/view/history.ts';

export const metadata: Metadata = { title: 'Settings' };

/** Settings (spec §5, screen 7): providers (configured or not, never the key), profile, budget, demo mode, names. */
export default async function SettingsPage() {
  const { services, workspaceId } = await getContext();
  const workspace = (await services.store.getWorkspace(workspaceId)) ?? (await services.store.ensureDefaultWorkspace());
  const spend = workspaceSpend(workspace.budgetUsd, await services.store.listRuns(workspaceId));
  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>These apply to this computer’s byway workspace. Changes save as you make them.</p>
        </div>
      </div>
      <SettingsView
        providers={services.gateway.providers()}
        profiles={services.gateway.profiles()}
        preferences={services.preferences.get()}
        spend={spend}
        mode={services.mode}
        technical={await technicalNames()}
      />
    </div>
  );
}
