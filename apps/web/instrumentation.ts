/**
 * Next.js calls register() once when the server process starts. byway uses it for one thing: when scripts/serve.ts
 * started this `next start` with an IPC channel, byway's stop ('stop', or the channel closing) closes the web process's
 * services before it exits, so its gateways hand back the recommending and composing calls they hold at once
 * (src/services/shutdown.ts; ADR-0099). In the Node.js runtime only: the services never run anywhere else.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { stopOnRequest } = await import('./src/services/shutdown.ts');
  stopOnRequest();
}
