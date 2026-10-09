'use client';

import type { SpendRecords } from '@byway/contracts';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { formatUsd } from '../view/format.ts';
import type { WorkspaceSpend } from '../view/history.ts';
import { callPurpose, FAULT_ADVICE, inFlightNote, outboxNote, providerName, setAsideNote, UNCERTAIN_ADVICE, uncertainReason } from '../view/spending.ts';
import { get, post } from './api.ts';

interface Props {
  records: SpendRecords;
  /** Calls settled at an assumed price (assumedPricingNote), or null. */
  pricingNote?: string | null;
}

/**
 * Settings' "Spending records" (ADR-0095): what the spend book holds that needs the person — calls that may have been
 * billed, with Clear, and lines of the spend ledger it could not read, with Acknowledge — and notes that need nothing:
 * calls under way, settled calls not yet in ledger.jsonl, torn ledger tails set aside, calls priced on an assumption.
 * "Check the spend ledger" checks the ledger's chain and the ledger against the records, on demand.
 */
export function SpendingRecords({ records: initial, pricingNote = null }: Props) {
  const router = useRouter();
  const ids = useId();
  const [records, setRecords] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ checking: boolean; message: string | null }>({ checking: false, message: null });

  async function act(body: { clear: string[] } | { acknowledge: number }) {
    setBusy(true);
    setError(null);
    try {
      const next = await post<{ records: SpendRecords; spend: WorkspaceSpend }>('/api/spend', body);
      setRecords(next.records);
      // The budget sentence above is the server's: refresh it for what is left now.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  /** Checks the spend ledger on demand (GET /api/ledger; ADR-0091, ADR-0095). */
  async function checkLedger() {
    setCheck({ checking: true, message: null });
    try {
      const { message } = await get<{ intact: boolean; message: string }>('/api/ledger');
      setCheck({ checking: false, message });
    } catch (err) {
      setCheck({ checking: false, message: err instanceof Error ? err.message : 'The check did not run. Try again.' });
    }
  }

  const notes = [inFlightNote(records), outboxNote(records), setAsideNote(records.setAside), pricingNote].filter((n): n is string => n !== null);
  const quiet = records.faults.length === 0 && records.uncertain.length === 0;

  return (
    <section className="settings-section" id="spending" aria-labelledby={`${ids}-spending`}>
      <h2 id={`${ids}-spending`}>Spending records</h2>
      <p className="section-note">
        byway records every paid call in its database from the moment it is allowed until its cost is known, and the budgets are checked against these records. Each settled call is also
        written to ledger.jsonl, the audit file.
      </p>
      {error ? (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      ) : null}

      {records.faults.length > 0 ? (
        <div className="notice notice-danger" role="alert">
          <p>
            <strong>Paid calls are paused.</strong> {FAULT_ADVICE}
          </p>
          <ul className="spend-list">
            {records.faults.map((f) => (
              <li key={f.id} className="spend-item">
                <span>{f.detail}</span>
                <button type="button" className="button" disabled={busy} onClick={() => void act({ acknowledge: f.id })}>
                  Acknowledge
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {records.uncertain.length > 0 ? (
        <div>
          <h3 className="spend-heading">May have been billed</h3>
          <ul className="spend-list">
            {records.uncertain.map((u) => (
              <li key={u.opId} className="spend-item">
                <span>
                  <strong>{formatUsd(u.usd)}</strong> · {callPurpose(u)}, {providerName(u.provider)} {u.model}. {uncertainReason(u)}
                </span>
                <button type="button" className="button" disabled={busy} onClick={() => void act({ clear: [u.opId] })} aria-label={`Clear ${formatUsd(u.usd)} for ${callPurpose(u)}`}>
                  Clear
                </button>
              </li>
            ))}
          </ul>
          <p className="section-note">{UNCERTAIN_ADVICE}</p>
          {records.uncertain.length > 1 ? (
            <div className="inline-form">
              <button type="button" className="button" disabled={busy} onClick={() => void act({ clear: records.uncertain.map((u) => u.opId) })}>
                Clear all {records.uncertain.length}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {quiet ? <p className="section-note">Nothing needs you here: no call may have been billed without its cost being known, and every line of the spend ledger can be read.</p> : null}
      {notes.map((note) => (
        <p key={note} className="section-note">
          {note}
        </p>
      ))}

      <div className="inline-form">
        <button type="button" className="button" onClick={() => void checkLedger()} disabled={check.checking}>
          {check.checking ? 'Checking…' : 'Check the spend ledger'}
        </button>
      </div>
      <p className="section-note" role="status" aria-live="polite">
        {check.message}
      </p>
    </section>
  );
}
