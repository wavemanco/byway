/**
 * A fake page renderer for the e2e scenarios (one real Playwright test lives in pages.test.ts): every page becomes one
 * small PNG whose colour comes from the HTML, so different pages give different screenshots. It can be held, to test
 * what pause does while renders are in flight.
 */
import { crc32, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { PageRenderer } from '../../src/pages.ts';

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A solid-colour RGB PNG. */
export function png(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]));
}

export interface FakePages extends PageRenderer {
  rendered: string[];
  /** While held, renders wait until released. */
  hold(): void;
  release(): void;
  /** Renders currently waiting on the hold. */
  waiting(): number;
}

export function fakePages(): FakePages {
  const rendered: string[] = [];
  let gate: Promise<void> | undefined;
  let open: (() => void) | undefined;
  let waiting = 0;
  return {
    rendered,
    hold() {
      gate ??= new Promise((r) => (open = r));
    },
    release() {
      open?.();
      gate = undefined;
      open = undefined;
    },
    waiting: () => waiting,
    async screenshots(html) {
      rendered.push(html);
      if (gate) {
        waiting++;
        await gate;
        waiting--;
      }
      const h = createHash('sha256').update(html).digest();
      return [png(8, 6, [h[0]!, h[1]!, h[2]!])];
    },
    async close() {},
  };
}
