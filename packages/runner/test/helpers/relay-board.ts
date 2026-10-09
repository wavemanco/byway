/**
 * A stand-in for fal's queue that several worker processes share (F03 stage 3): relay links submit their clip as a job
 * over HTTP to the test process, record it as accepted, and poll its status, which the test holds until it chooses. So
 * a test can kill the worker whose job is being made, and see the next worker resume that job from its stored id
 * instead of submitting (and paying for) another. The clip and frame themselves are the demo's placeholders.
 *
 * Nothing here leaves this computer: the board listens on 127.0.0.1 only.
 */
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mockAdapter, type ProviderAdapter } from '@byway/gateway';

export interface RelayBoard {
  url: string;
  /** Every clip submitted, in order: its job id and shot. */
  submissions: { id: string; shot?: number }[];
  /** Every status poll, by job id. */
  polls: string[];
  /** Answer every status poll at once from now on (held ones too). */
  release(): void;
  close(): Promise<void>;
}

/** Starts the board on a free port of 127.0.0.1. Status polls are held until release(). */
export async function relayBoard(): Promise<RelayBoard> {
  const submissions: RelayBoard['submissions'] = [];
  const polls: string[] = [];
  const held: ServerResponse[] = [];
  let released = false;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://board');
    if (req.method === 'POST' && url.pathname === '/submit') {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const id = `job-${submissions.length + 1}`;
        const shot = (JSON.parse(body || '{}') as { shot?: number }).shot;
        submissions.push({ id, ...(shot !== undefined ? { shot } : {}) });
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ request_id: id }));
      });
      return;
    }
    const status = /^\/status\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && status) {
      polls.push(decodeURIComponent(status[1] as string));
      if (released) return void res.writeHead(200).end('COMPLETED');
      held.push(res);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    submissions,
    polls,
    release() {
      released = true;
      for (const res of held.splice(0)) if (!res.destroyed) res.writeHead(200).end('COMPLETED');
    },
    async close() {
      for (const res of held.splice(0)) res.destroy();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}

/**
 * The mock provider, with relay clips made through the board as fal makes them: the clip is submitted once (under the
 * gateway's submission rule), recorded as accepted, and polled until done; a job an earlier attempt submitted
 * (req.resume) is only polled. Everything else is the demo's mock.
 */
export function boardAdapter(url: string): ProviderAdapter {
  const mock = mockAdapter();
  return {
    ...mock,
    id: 'mock',
    async video(req) {
      let id = req.resume?.generation;
      if (id === undefined) {
        const submitted = await req.submit(async () => {
          const res = await fetch(`${url}/submit`, { method: 'POST', body: JSON.stringify({ shot: req.shot }) });
          if (!res.ok) throw new Error(`the board answered HTTP ${res.status}`);
          return (await res.json()) as { request_id: string };
        }, 'the clip');
        id = submitted.request_id;
        await req.accepted?.('generation', id);
      }
      const job = id;
      await req.attempt(async () => {
        const res = await fetch(`${url}/status/${encodeURIComponent(job)}`);
        if (!res.ok) throw new Error(`the board answered HTTP ${res.status}`);
        await res.text();
      });
      return mock.video!(req);
    },
  };
}
