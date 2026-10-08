'use client';

/**
 * "Show technical names" (spec §5): a Store preference (Preferences.showTechnicalNames). The root layout reads it
 * on the server and hands it down, so server-rendered screens and client components agree on first paint.
 */
import { createContext, useContext, type ReactNode } from 'react';

const TechnicalNames = createContext(false);

export function TechNamesProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <TechnicalNames value={value}>{children}</TechnicalNames>;
}

export function useTechnicalNames(): boolean {
  return useContext(TechnicalNames);
}
