import { deflateSync } from 'node:zlib';
import { rng, type Rand } from './seed.ts';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Encode RGB pixels (row-major, 3 bytes per pixel) as a PNG. No dependency: IHDR, one IDAT, IEND. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]));
}

type RGB = [number, number, number];

function hsl(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/**
 * A small abstract picture from a seed: a two-tone gradient sky, a soft sun and layered hills. It stands in for a
 * generated image in demo mode, at a fraction of the size (the aspect ratio follows the requested size).
 */
export function mockImage(seed: number, width: number, height: number): Uint8Array {
  const rand: Rand = rng(seed);
  const hue = rand() * 360;
  const top = hsl(hue, 0.45, 0.82);
  const bottom = hsl((hue + 30) % 360, 0.5, 0.62);
  const sun = hsl((hue + 180) % 360, 0.65, 0.6);
  const hills = [hsl((hue + 200) % 360, 0.3, 0.38), hsl((hue + 220) % 360, 0.35, 0.26)];
  const sx = width * (0.25 + rand() * 0.5);
  const sy = height * (0.25 + rand() * 0.2);
  const sr = Math.min(width, height) * (0.12 + rand() * 0.08);
  const waves = hills.map((_, i) => ({ base: height * (0.62 + i * 0.14), amp: height * (0.05 + rand() * 0.06), freq: 1.5 + rand() * 2.5, phase: rand() * 6.28 }));
  const px = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = y / Math.max(1, height - 1);
      let c: RGB = [0, 1, 2].map((k) => Math.round((top[k] as number) * (1 - t) + (bottom[k] as number) * t)) as RGB;
      if ((x - sx) ** 2 + (y - sy) ** 2 < sr * sr) c = sun;
      waves.forEach((w, i) => {
        if (y > w.base + w.amp * Math.sin((x / width) * w.freq * Math.PI * 2 + w.phase)) c = hills[i] as RGB;
      });
      px.set(c, (y * width + x) * 3);
    }
  }
  return encodePng(width, height, px);
}
