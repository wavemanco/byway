'use client';

import type { SpendRecords } from '@byway/contracts';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { formatUsd } from '../view/format.ts';
import type { WorkspaceSpend } from '../view/history.ts';
import { callPurpose, clearable, FAULT_ADVICE, inFlightNote, outboxNote, providerName, quietNote, setAsideNote, UNCERTAIN_ADVICE, uncertainReason } from '../view/spending.ts';
import { ActionButton } from './ActionButton.tsx';
import { get, post } from './api.ts';
import { useAction } from './useAction.ts';

interface Props {
  records: SpendRecords;
  /** Calls counted on an assumption (assumedPricingNote), or null. */
  pricingNote?: string | null;
}

/**
 * Settings' "Spending records" (ADR-0095): what the spend book holds that needs the person — calls that may have been
 * billed, with Clear, and lines of the spend ledger it could not read, with Acknowledge — and notes that need nothing:
 * calls under way, settled calls not yet in ledger.jsonl, torn ledger tails set aside, calls priced on an assumption.
 * "Check the spend ledger" checks the ledger's chain and the ledger against the records, on demand. Its buttons keep
 * focus while they act (R5); one whose item goes once it is done hands focus to the section's heading, not the page.
 */
export function SpendingRecords({ records: initial, pricingNote = null }: Props) {
  const router = useRouter();
  const ids = useId();
  const [records, setRecords] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // One action at a time; the pressed button keeps focus while it runs (R5).
  const acting = useAction(async (body: { clear: string[] } | { acknowledge: number }) => {
    setError(null);
    try {
      const next = await post<{ records: SpendRecords; spend: WorkspaceSpend }>('/api/spend', body);
      setRecords(next.records);
      // The pressed button's item is gone now: focus goes to the heading rather than falling to the page.
      requestAnimationFrame(() => {
        if (document.activeElement === null || document.activeElement === document.body) heading.current?.focus();
      });
      // The budget sentence above is the server's: refresh it for what is left now.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.');
    }
  });
  const act = (body: { clear: string[] } | { acknowledge: number }) => void acting.run(body);

  /**
   * Checks the spend ledger on demand (GET /api/ledger; ADR-0091, ADR-0095). The check reads any new ledger line into the
   * spend book first, so the records are read again after it: a line it found that pauses paid calls is listed here.
   */
  async function checkLedger() {
    setCheckMessage(null);
    try {
      const { message } = await get<{ intact: boolean; message: string }>('/api/ledger');
      setCheckMessage(message);
      const next = await get<{ records: SpendRecords; spend: WorkspaceSpend }>('/api/spend').catch(() => null);
      if (next) setRecords(next.records);
    } catch (err) {
      setCheckMessage(err instanceof Error ? err.message : 'The check did not run. Try again.');
    }
  }
  // One check at a time; its button keeps focus while it runs (R5).
  const checking = useAction(checkLedger);

  const notes = [inFlightNote(records), outboxNote(records), setAsideNote(records.setAside), pricingNote].filter((n): n is string => n !== null);
  const quiet = quietNote(records);
  const canClear = records.uncertain.filter((u) => clearable(u, records));

  return (
    <section className="settings-section" id="spending" aria-labelledby={`${ids}-spending`}>
      <h2 id={`${ids}-spending`} ref={heading} tabIndex={-1}>
        Spending records
      </h2>
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
                <ActionButton className="button" busy={acting.busy} onClick={() => act({ acknowledge: f.id })}>
                  Acknowledge
                </ActionButton>
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
                {clearable(u, records) ? (
                  <ActionButton className="button" busy={acting.busy} onClick={() => act({ clear: [u.opId] })} aria-label={`Clear ${formatUsd(u.usd)} for ${callPurpose(u)}`}>
                    Clear
                  </ActionButton>
                ) : (
                  <span className="section-note">You can clear it once the call sent again ends.</span>
                )}
              </li>
            ))}
          </ul>
          <p className="section-note">{UNCERTAIN_ADVICE}</p>
          {canClear.length > 1 ? (
            <div className="inline-form">
              <ActionButton className="button" busy={acting.busy} onClick={() => act({ clear: canClear.map((u) => u.opId) })}>
                Clear all {canClear.length}
              </ActionButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {quiet ? <p className="section-note">{quiet}</p> : null}
      {notes.map((note) => (
        <p key={note} className="section-note">
          {note}
        </p>
      ))}

      <div className="inline-form">
        <ActionButton className="button" busy={checking.busy} onClick={() => void checking.run()}>
          {checking.busy ? 'Checking…' : 'Check the spend ledger'}
        </ActionButton>
      </div>
      <p className="section-note" role="status" aria-live="polite">
        {checkMessage}
      </p>
    </section>
  );
}
