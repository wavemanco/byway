/** Reads "Show technical names" in server components, from the same cookie the client switch writes. */
import { cookies } from 'next/headers';
import { TECHNICAL_COOKIE } from '../view/prefs.ts';

export async function technicalNames(): Promise<boolean> {
  return (await cookies()).get(TECHNICAL_COOKIE)?.value === '1';
}
