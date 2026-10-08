'use client';

/**
 * "Show technical names" (spec §5): a per-browser display preference kept in a cookie so server-rendered
 * screens and client components agree on first paint.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { TECHNICAL_COOKIE } from '../view/prefs.ts';

const TechnicalNames = createContext(false);

export function TechNamesProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <TechnicalNames value={value}>{children}</TechnicalNames>;
}

export function useTechnicalNames(): boolean {
  return useContext(TechnicalNames);
}

export function setTechnicalNamesCookie(on: boolean): void {
  document.cookie = `${TECHNICAL_COOKIE}=${on ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
}
