'use client';

import type { Ref } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  /** Cannot be used here at all (the native disabled state). */
  disabled?: boolean;
  /**
   * Briefly unavailable while something it started finishes (the chooser re-routing). It keeps focus, which a disabled
   * button would lose to the page, and ignores presses meanwhile (UX-2).
   */
  busy?: boolean;
  /** The button, for a screen that hands focus back to the switch (a confirmation that has gone). */
  ref?: Ref<HTMLButtonElement>;
}

/** An on/off switch with the native button's keyboard behaviour (Space and Enter toggle). */
export function Switch({ checked, onChange, labelledBy, describedBy, disabled, busy = false, ref }: SwitchProps) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={busy || undefined}
      disabled={disabled}
      onClick={() => {
        if (!busy) onChange(!checked);
      }}
    />
  );
}
