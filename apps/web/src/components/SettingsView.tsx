'use client';

import type { Preferences, ProfileStatus, ProviderId, ProviderStatus } from '@byway/contracts';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { formatUsd, parseBudgetInput } from '../view/format.ts';
import type { WorkspaceSpend } from '../view/history.ts';
import { profileNeeds, videoAvailability } from '../view/labels.ts';
import { get, patch } from './api.ts';
import { Switch } from './Switch.tsx';
import { SINGLE_KEY_SHORTCUTS, useViewerFlag } from './viewerFlags.ts';

const PROVIDERS: Record<ProviderId, { name: string; does: string; env?: string }> = {
  anthropic: { name: 'Anthropic', does: 'Claude models for drafting and judgment', env: 'ANTHROPIC_API_KEY' },
  openai: { name: 'OpenAI', does: 'GPT models and image generation', env: 'OPENAI_API_KEY' },
  google: { name: 'Google', does: 'Gemini models', env: 'GEMINI_API_KEY' },
  openrouter: { name: 'OpenRouter', does: 'Other model families, one pinned provider each', env: 'OPENROUTER_API_KEY' },
  fal: { name: 'fal.ai', does: 'Image and video generation for Ad Video Chain', env: 'FAL_KEY' },
  mock: { name: 'Sample outputs', does: 'Built in. Answers every step with sample outputs at no cost' },
};

const TIER_WORDS = { big: 'Judgment', mid: 'Drafting' } as const;

interface Props {
  providers: ProviderStatus[];
  /** Every profile with what it is missing (Gateway.profileStatus), so you can see what a key would unlock. */
  profiles: ProfileStatus[];
  /** Store preferences: the profile, demo mode and technical names. */
  preferences: Preferences;
  spend: WorkspaceSpend;
  /** Calls settled at an assumed price (assumedPricingNote), or null. */
  pricingNote?: string | null;
  mode: 'demo' | 'live';
  /** byway was started with `pnpm demo`: demo mode stays on whatever this setting says. */
  demoForced?: boolean;
}

export function SettingsView({ providers, profiles, preferences: initial, spend, pricingNote = null, mode, demoForced = false }: Props) {
  const router = useRouter();
  const ids = useId();
  const [prefs, setPrefs] = useState(initial);
  const technical = prefs.showTechnicalNames;
  const chosen = profiles.find((s) => s.profile.id === prefs.profileId);
  const [budgetText, setBudgetText] = useState(spend.capUsd.toFixed(2));
  const [cap, setCap] = useState(spend.capUsd);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ledgerCheck, setLedgerCheck] = useState<{ checking: boolean; message: string | null }>({ checking: false, message: null });
  const realConfigured = providers.some((p) => p.provider !== 'mock' && p.configured);
  const [singleKeys, setSingleKeys] = useViewerFlag(SINGLE_KEY_SHORTCUTS);

  async function save(body: Record<string, unknown>, done: string) {
    setError(null);
    setSaved(null);
    try {
      const next = await patch<Preferences>('/api/settings', body);
      setPrefs(next);
      setSaved(done);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That was not saved. Try again.');
      return false;
    }
  }

  /** Checks the spend ledger's chain on demand (GET /api/ledger; ADR-0091). */
  async function checkLedger() {
    setLedgerCheck({ checking: true, message: null });
    try {
      const { message } = await get<{ intact: boolean; message: string }>('/api/ledger');
      setLedgerCheck({ checking: false, message });
    } catch (err) {
      setLedgerCheck({ checking: false, message: err instanceof Error ? err.message : 'The check did not run. Try again.' });
    }
  }

  async function saveBudget() {
    const value = parseBudgetInput(budgetText);
    if (value === null) {
      setError('Enter the workspace budget in dollars, more than $0 and at most $1,000.');
      return;
    }
    if (await save({ workspaceBudgetUsd: value }, `Workspace budget set to ${formatUsd(value)}.`)) setCap(value);
  }

  return (
    <div className="settings">
      <p className="sr-only" role="status" aria-live="polite">
        {saved}
      </p>
      {error ? (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section className="settings-section" id="providers" aria-labelledby={`${ids}-providers`}>
        <h2 id={`${ids}-providers`}>Providers</h2>
        <p className="section-note">
          byway reads provider keys from <code>.env.agents</code> at the repository root when it starts. Keys never leave this computer’s environment: they are not
          shown here, stored, logged or sent to the browser.
        </p>
        <ul className="providers">
          {providers.map((p) => {
            const info = PROVIDERS[p.provider];
            return (
              <li key={p.provider} className="provider">
                <div>
                  <p className="provider-name">{info.name}</p>
                  <p className="muted small">{info.does}</p>
                </div>
                <div className="provider-state">
                  <span className={p.configured ? 'tag tag-you' : 'tag'}>{p.configured ? (p.provider === 'mock' ? 'Always on' : 'Key set') : 'No key'}</span>
                  {!p.configured && info.env ? <span className="muted small">Set {info.env}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="settings-section" aria-labelledby={`${ids}-demo`}>
        <div className="setting-row">
          <div>
            <h2 id={`${ids}-demo`}>Demo mode</h2>
            <p id={`${ids}-demo-help`} className="muted">
              {demoForced
                ? 'byway was started with pnpm demo, so every run uses sample outputs and costs nothing. Start it with pnpm start to use real models.'
                : realConfigured
                ? 'Use sample outputs instead of real models, at no cost.'
                : 'No provider key is set, so every run uses sample outputs and costs nothing. Add a key to use real models.'}
            </p>
          </div>
          <Switch
            checked={mode === 'demo' || prefs.demoMode}
            onChange={(on) => void save({ demoMode: on }, on ? 'Demo mode on.' : 'Demo mode off.')}
            labelledBy={`${ids}-demo`}
            describedBy={`${ids}-demo-help`}
            disabled={demoForced || !realConfigured}
          />
        </div>
      </section>

      <section className="settings-section" aria-labelledby={`${ids}-profile`}>
        <h2 id={`${ids}-profile`}>Model profile</h2>
        <p className="section-note">Which models do the AI steps. Judgment (critique, picking, checks) uses the larger model; drafting uses the other.</p>
        <fieldset className="profiles" aria-describedby={`${ids}-video`}>
          <legend className="sr-only">Model profile</legend>
          {profiles.map(({ profile, ...status }) => {
            const needs = profileNeeds(status);
            return (
              <label key={profile.id} className="profile" data-checked={prefs.profileId === profile.id ? 'true' : undefined}>
                <input
                  type="radio"
                  name="profile"
                  value={profile.id}
                  checked={prefs.profileId === profile.id}
                  onChange={() => void save({ profileId: profile.id }, `Model profile set to ${profile.label}.`)}
                />
                <span>
                  <span className="profile-name">{profile.label}</span>
                  <span className="profile-models">
                    {(Object.keys(TIER_WORDS) as (keyof typeof TIER_WORDS)[]).map((tier) => (
                      <span key={tier}>
                        {technical ? `${TIER_WORDS[tier]} (${tier})` : TIER_WORDS[tier]}: {profile.tiers[tier].model}
                      </span>
                    ))}
                  </span>
                  {needs ? <span className="profile-needs">{mode === 'demo' ? `${needs}. Demo runs use sample outputs meanwhile.` : needs}</span> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
        <p id={`${ids}-video`} className="profile-video">
          {videoAvailability(chosen)}
          {mode === 'demo' && !chosen?.video ? <span className="muted">. Demo runs show labelled placeholder clips instead.</span> : null}
        </p>
      </section>

      <section className="settings-section" aria-labelledby={`${ids}-budget`}>
        <h2 id={`${ids}-budget`}>Workspace budget</h2>
        <p className="section-note">
          byway does not start a call whose estimated cost would take your spending past this amount. Estimates can be low, so spending can end slightly over. {formatUsd(spend.spentUsd)} spent so far; {formatUsd(Math.max(0, cap - spend.spentUsd))} left. Each run also has its own
          budget, set when you start it.
        </p>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveBudget();
          }}
        >
          <label className="sr-only" htmlFor={`${ids}-budget-input`}>
            Workspace budget in dollars
          </label>
          <span className="money">
            <span aria-hidden="true">$</span>
            <input id={`${ids}-budget-input`} inputMode="decimal" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} />
          </span>
          <button type="submit" className="button">
            Save budget
          </button>
        </form>
        {pricingNote ? <p className="section-note">{pricingNote}</p> : null}
        <div className="inline-form">
          <button type="button" className="button" onClick={() => void checkLedger()} disabled={ledgerCheck.checking}>
            {ledgerCheck.checking ? 'Checking…' : 'Check the spend ledger'}
          </button>
        </div>
        <p className="section-note" role="status" aria-live="polite">
          {ledgerCheck.message}
        </p>
      </section>

      <section className="settings-section" aria-labelledby={`${ids}-names`}>
        <div className="setting-row">
          <div>
            <h2 id={`${ids}-names`}>Show technical names</h2>
            <p id={`${ids}-names-help`} className="muted">
              Adds the protocol’s codes next to plain names, for example Random spark (SEED) or Landing Page Studio as C1.
            </p>
          </div>
          <Switch
            checked={technical}
            onChange={(on) => void save({ showTechnicalNames: on }, on ? 'Technical names shown.' : 'Technical names hidden.')}
            labelledBy={`${ids}-names`}
            describedBy={`${ids}-names-help`}
          />
        </div>
      </section>

      <section className="settings-section" aria-labelledby={`${ids}-keys`}>
        <div className="setting-row">
          <div>
            <h2 id={`${ids}-keys`}>Single-key shortcuts</h2>
            <p id={`${ids}-keys-help`} className="muted">
              On a Your turn, keys such as Y and N, J and K, Space and Enter answer or move while the question has focus. Turn them off if you use speech
              input or type into the page by accident. Ctrl+Enter still sends what you wrote. Saved in this browser only.
            </p>
          </div>
          <Switch
            checked={singleKeys}
            onChange={(on) => {
              setSingleKeys(on);
              setSaved(on ? 'Single-key shortcuts on.' : 'Single-key shortcuts off.');
            }}
            labelledBy={`${ids}-keys`}
            describedBy={`${ids}-keys-help`}
          />
        </div>
      </section>
    </div>
  );
}
