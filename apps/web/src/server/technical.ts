/** Reads "Show technical names" in server components: a Store preference, so every screen agrees on first paint. */
import { getContext } from '../services/index.ts';

export async function technicalNames(): Promise<boolean> {
  return (await getContext()).preferences.showTechnicalNames;
}
