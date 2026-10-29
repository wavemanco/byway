import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ArtifactCorruptError, artifactPath } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

const sha = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

describe('artifact store', () => {
  it('stores bytes under artifacts/sha256/<2 hex>/<rest> with a sha256 id and a record', async () => {
    const store = openStore({ now: () => new Date('2026-10-07T12:00:00.000Z') });
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
    const hex = sha(bytes);
    const record = await store.artifacts.put(bytes, 'image/png');
    expect(record).toEqual({ id: `sha256:${hex}`, mediaType: 'image/png', bytes: 8, createdAt: '2026-10-07T12:00:00.000Z' });
    const file = join(store.dataDir, 'artifacts', 'sha256', hex.slice(0, 2), hex.slice(2));
    expect(artifactPath(store.dataDir, record.id)).toBe(file);
    expect(new Uint8Array(readFileSync(file))).toEqual(bytes);
    const got = await store.artifacts.get(record.id);
    expect(got.record).toEqual(record);
    expect(got.bytes).toEqual(bytes);
    expect(await store.artifacts.has(record.id)).toBe(true);
  });

  it('round-trips UTF-8 text, including a byte-order mark', async () => {
    const store = openStore();
    const text = '﻿# Memo\n\nNaïve café — “quoted” ✓ 🍞\n';
    const record = await store.artifacts.putText(text, 'text/markdown');
    expect(record.id).toBe(`sha256:${sha(Buffer.from(text, 'utf8'))}`);
    expect(record.bytes).toBe(Buffer.byteLength(text, 'utf8'));
    expect(await store.artifacts.getText(record.id)).toBe(text);
  });

  it('dedupes identical content: one file, one record, the first record wins', async () => {
    const store = openStore();
    const a = await store.artifacts.putText('<p>same</p>', 'text/html');
    const b = await store.artifacts.putText('<p>same</p>', 'text/html');
    const c = await store.artifacts.put(Buffer.from('<p>same</p>'), 'text/plain');
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    const hex = a.id.slice('sha256:'.length);
    expect(readdirSync(join(store.dataDir, 'artifacts', 'sha256', hex.slice(0, 2)))).toEqual([hex.slice(2)]);
  });

  it('dedupes concurrent puts of the same content', async () => {
    const store = openStore();
    const records = await Promise.all(Array.from({ length: 20 }, () => store.artifacts.putText('race', 'text/plain')));
    expect(new Set(records.map((r) => r.id)).size).toBe(1);
    expect(await store.artifacts.getText(records[0]!.id)).toBe('race');
  });

  it('detects corruption on read and refuses to return the bytes', async () => {
    const store = openStore();
    const record = await store.artifacts.putText('original', 'text/plain');
    writeFileSync(artifactPath(store.dataDir, record.id), 'tampered');
    await expect(store.artifacts.get(record.id)).rejects.toThrow(ArtifactCorruptError);
    await expect(store.artifacts.getText(record.id)).rejects.toThrow(/does not match its content address/);
  });

  it('heals a corrupted file when the same content is put again', async () => {
    const store = openStore();
    const record = await store.artifacts.putText('original', 'text/plain');
    writeFileSync(artifactPath(store.dataDir, record.id), 'tampered');
    await store.artifacts.putText('original', 'text/plain');
    expect(await store.artifacts.getText(record.id)).toBe('original');
  });

  it('reports a missing file as corruption, and has() as false', async () => {
    const store = openStore();
    const record = await store.artifacts.putText('gone soon', 'text/plain');
    rmSync(artifactPath(store.dataDir, record.id));
    expect(await store.artifacts.has(record.id)).toBe(false);
    await expect(store.artifacts.get(record.id)).rejects.toThrow(ArtifactCorruptError);
  });

  it('throws not-found for an unknown id and rejects malformed ids', async () => {
    const store = openStore();
    const unknown = `sha256:${'f'.repeat(64)}`;
    await expect(store.artifacts.get(unknown)).rejects.toMatchObject({ code: 'not-found' });
    expect(await store.artifacts.has(unknown)).toBe(false);
    for (const bad of ['sha256:XYZ', 'md5:abc', `sha256:${'F'.repeat(64)}`, `sha256:../../${'a'.repeat(58)}`]) {
      await expect(store.artifacts.get(bad)).rejects.toMatchObject({ code: 'invalid' });
      expect(await store.artifacts.has(bad)).toBe(false);
    }
  });

  it('rejects a malformed media type', async () => {
    const store = openStore();
    for (const mt of ['', 'html', 'text/html\nx-evil: 1']) {
      await expect(store.artifacts.putText('x', mt)).rejects.toThrow(/media type/);
    }
  });

  it('getText refuses binary content that is not UTF-8', async () => {
    const store = openStore();
    const record = await store.artifacts.put(new Uint8Array([0xff, 0xfe, 0xfd]), 'application/octet-stream');
    await expect(store.artifacts.getText(record.id)).rejects.toThrow(/UTF-8/);
  });

  it('leaves no temporary files behind', async () => {
    const store = openStore();
    await Promise.all([store.artifacts.putText('one', 'text/plain'), store.artifacts.putText('two', 'text/plain')]);
    const tmp = join(store.dataDir, 'artifacts', 'tmp');
    expect(existsSync(tmp) ? readdirSync(tmp) : []).toEqual([]);
  });

  it.each(['writeFile', 'sync'] as const)('removes its temporary file when %s fails, and rejects with that failure', async (method) => {
    const store = openStore();
    const probe = await open(join(store.dataDir, 'probe'), 'w');
    const proto = Object.getPrototypeOf(probe) as Record<typeof method, () => Promise<void>>;
    await probe.close();
    const full = Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    const spy = vi.spyOn(proto, method).mockRejectedValueOnce(full);
    try {
      await expect(store.artifacts.putText('a clip that does not fit', 'text/plain')).rejects.toBe(full);
    } finally {
      spy.mockRestore();
    }
    expect(readdirSync(join(store.dataDir, 'artifacts', 'tmp'))).toEqual([]);
  });

  it('shares artifacts between store instances on one data directory', async () => {
    const dataDir = tempDir();
    const a = openStore({ dataDir });
    const b = openStore({ dataDir });
    const record = await a.artifacts.putText('shared', 'text/plain');
    expect(await b.artifacts.getText(record.id)).toBe('shared');
  });
});
