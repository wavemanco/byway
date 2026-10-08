import { describe, expect, it } from 'vitest';
import { artifactHeaders, isArtifactId } from '../src/server/artifacts.ts';
import { checkRequest } from '../src/server/guard.ts';
import { createIntakeStore } from '../src/server/intakes.ts';
import { ProblemInput, ResolutionInput, SettingsPatch, StartInput } from '../src/server/schemas.ts';

const ID = `sha256:${'a'.repeat(64)}`;

describe('request guard', () => {
  const req = (over: Partial<Parameters<typeof checkRequest>[0]> = {}) =>
    checkRequest({ method: 'GET', host: '127.0.0.1:3000', origin: null, secFetchSite: null, ...over });

  it('answers only on loopback hosts, which also stops DNS rebinding', () => {
    expect(req().ok).toBe(true);
    expect(req({ host: 'localhost:3000' }).ok).toBe(true);
    expect(req({ host: '[::1]:3000' }).ok).toBe(true);
    expect(req({ host: 'evil.example:3000' })).toMatchObject({ ok: false, status: 403 });
    expect(req({ host: null })).toMatchObject({ ok: false });
  });

  it('refuses cross-site writes', () => {
    expect(req({ method: 'POST', origin: 'http://127.0.0.1:3000', secFetchSite: 'same-origin' }).ok).toBe(true);
    expect(req({ method: 'POST', origin: 'https://evil.example', secFetchSite: 'cross-site' })).toMatchObject({ ok: false, status: 403 });
    expect(req({ method: 'POST', origin: 'http://localhost:3000' })).toMatchObject({ ok: false, status: 403 });
    expect(req({ method: 'POST', origin: 'null' })).toMatchObject({ ok: false, status: 403 });
    expect(req({ method: 'DELETE', secFetchSite: 'same-site' })).toMatchObject({ ok: false });
    // Reads stay open to same-machine tools such as curl.
    expect(req({ method: 'GET', secFetchSite: 'cross-site' }).ok).toBe(true);
  });
});

describe('artifact route headers', () => {
  it('recognises content-addressed ids only', () => {
    expect(isArtifactId(ID)).toBe(true);
    expect(isArtifactId('sha256:../../etc/passwd')).toBe(false);
    expect(isArtifactId('a'.repeat(64))).toBe(false);
  });

  it('sandboxes pages with a strict CSP: scripts yes, same origin no, no network writes', () => {
    const h = artifactHeaders('text/html', 'http://127.0.0.1:3000');
    const csp = h['Content-Security-Policy'] ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/(^|; )sandbox allow-scripts(;|$)/);
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain('img-src http://127.0.0.1:3000/artifacts/ data: blob:');
    expect(h['Content-Type']).toBe('text/html; charset=utf-8');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Cache-Control']).toContain('immutable');
  });

  it('never lets other media run scripts', () => {
    for (const type of ['image/svg+xml', 'text/markdown', 'application/json', 'text/x-diff', 'image/png']) {
      const csp = artifactHeaders(type, 'http://127.0.0.1:3000')['Content-Security-Policy'] ?? '';
      expect(csp, type).toContain("default-src 'none'");
      expect(csp, type).toMatch(/sandbox(;|$)/);
      expect(csp, type).not.toContain('script-src');
    }
  });

  it('offers downloads with a safe file name', () => {
    const h = artifactHeaders('text/markdown', 'http://127.0.0.1:3000', 'Memo: Q3 "offsite"');
    expect(h['Content-Disposition']).toBe('attachment; filename="memo-q3-offsite.md"');
  });
});

describe('intakes', () => {
  it('keeps the problem between Start and the run, and forgets the oldest past the limit', () => {
    const store = createIntakeStore(2);
    const a = store.create({ problem: { text: 'one' } });
    const b = store.create({ problem: { text: 'two' }, recipeId: 'c4' });
    expect(store.get(a.id)?.problem.text).toBe('one');
    expect(store.get(b.id)?.recipeId).toBe('c4');
    store.create({ problem: { text: 'three' } });
    expect(store.get(a.id)).toBeUndefined();
    expect(store.get(b.id)).toBeDefined();
  });
});

describe('request schemas', () => {
  it('accepts a problem with attachments and rejects empty or huge input', () => {
    expect(ProblemInput.safeParse({ text: 'A memo', attachments: [{ name: 'Draft', text: 'hi' }] }).success).toBe(true);
    expect(ProblemInput.safeParse({ text: '   ' }).success).toBe(false);
    expect(ProblemInput.safeParse({ text: 'x'.repeat(20_001) }).success).toBe(false);
  });

  it('checks starts, answers and settings', () => {
    expect(StartInput.safeParse({ intakeId: '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f', recipeId: 'c4', budgetUsd: 2 }).success).toBe(true);
    expect(StartInput.safeParse({ intakeId: '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f', budgetUsd: 0 }).success).toBe(false);
    expect(ResolutionInput.safeParse({ choice: ['a'] }).success).toBe(true);
    expect(ResolutionInput.safeParse({ approved: 'yes' }).success).toBe(false);
    expect(SettingsPatch.safeParse({ workspaceBudgetUsd: 50, demoMode: true }).success).toBe(true);
    expect(SettingsPatch.safeParse({ workspaceBudgetUsd: -1 }).success).toBe(false);
  });
});
