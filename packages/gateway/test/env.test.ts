import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEY_VARS, configuredProviders, loadEnvFile, namesFromEnvFile, parseEnv, withoutSecrets } from '../src/env.ts';

describe('parseEnv', () => {
  it('reads KEY=VALUE lines, skipping comments and blanks', () => {
    const text = ['# keys for agents', '', 'A=1', '  B = two words  ', 'export C=3', '# D=commented'].join('\n');
    expect(parseEnv(text)).toEqual({ A: '1', B: 'two words', C: '3' });
  });

  it('handles quotes, escapes and inline comments', () => {
    const text = [
      `SINGLE='literal \\n # not a comment'`,
      `DOUBLE="line\\nbreak \\"quoted\\" # kept"`,
      'INLINE=value # trailing comment',
      'HASHY=abc#def',
      'EMPTY=',
      'EMPTY_QUOTED=""',
    ].join('\n');
    expect(parseEnv(text)).toEqual({
      SINGLE: 'literal \\n # not a comment',
      DOUBLE: 'line\nbreak "quoted" # kept',
      INLINE: 'value',
      HASHY: 'abc#def',
      EMPTY: '',
      EMPTY_QUOTED: '',
    });
  });

  it('accepts CRLF line endings and a byte-order mark', () => {
    expect(parseEnv('﻿A=1\r\nB="2"\r\n')).toEqual({ A: '1', B: '2' });
  });

  it('ignores malformed lines and invalid names', () => {
    expect(parseEnv(['no equals sign', '=nokey', '1BAD=x', 'GOOD_1=y'].join('\n'))).toEqual({ GOOD_1: 'y' });
  });
});

describe('loadEnvFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'byway-env-'));

  it('sets only variables that are missing, and reports names, never values', () => {
    const file = join(dir, '.env.agents');
    writeFileSync(file, 'ANTHROPIC_API_KEY=sk-ant-file\nOPENAI_API_KEY=sk-file\nGEMINI_API_KEY=\n');
    const env: Record<string, string | undefined> = { OPENAI_API_KEY: 'sk-shell' };
    const report = loadEnvFile(file, env);
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-file');
    expect(env.OPENAI_API_KEY).toBe('sk-shell');
    expect(report).toEqual({ found: true, loaded: ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY'], kept: ['OPENAI_API_KEY'] });
    expect(JSON.stringify(report)).not.toContain('sk-');
  });

  it('treats an empty variable as missing', () => {
    const file = join(dir, 'empty.env');
    writeFileSync(file, 'FAL_KEY=abc\n');
    const env: Record<string, string | undefined> = { FAL_KEY: '' };
    loadEnvFile(file, env);
    expect(env.FAL_KEY).toBe('abc');
  });

  it('is a no-op when the file does not exist', () => {
    const env: Record<string, string | undefined> = {};
    expect(loadEnvFile(join(dir, 'absent.env'), env)).toEqual({ found: false, loaded: [], kept: [] });
    expect(env).toEqual({});
  });
});

describe('configuredProviders', () => {
  it('reports which providers have a non-empty key, and the mock always', () => {
    const status = configuredProviders({ ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: '  ', OPENROUTER_API_KEY: 'k' });
    expect(status).toEqual([
      { provider: 'anthropic', configured: true },
      { provider: 'openai', configured: false },
      { provider: 'google', configured: false },
      { provider: 'openrouter', configured: true },
      { provider: 'fal', configured: false },
      { provider: 'mock', configured: true },
    ]);
  });

  it('names the spec variables', () => {
    expect(KEY_VARS).toEqual({
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GEMINI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      fal: 'FAL_KEY',
    });
  });
});

describe('withoutSecrets: the one rule for a child process that must hold no key (SEC-3)', () => {
  it('gives no provider key or other secret-looking variable, so none can be cached under the repo or reach the renderer', () => {
    const env = {
      PATH: '/bin',
      ANTHROPIC_API_KEY: 'sk-ant-SENTINEL',
      FAL_KEY: 'fal-SENTINEL',
      GITHUB_TOKEN: 'ghp-SENTINEL',
      MY_SECRET: 'x',
      BYWAY_DATA_DIR: '/data',
      UNSET: undefined,
    };
    expect(withoutSecrets(env)).toEqual({ PATH: '/bin', BYWAY_DATA_DIR: '/data' });
  });

  it('always drops every provider key name, in any case, and the extra names it is given', () => {
    const env: Record<string, string> = { HOME: '/home/me', ODD_CREDENTIAL: 'x', keep_me: 'y' };
    for (const name of Object.values(KEY_VARS)) env[name.toLowerCase()] = 'v';
    expect(withoutSecrets(env, ['odd_credential'])).toEqual({ HOME: '/home/me', keep_me: 'y' });
  });
});

describe('namesFromEnvFile: what the secrets file listed into an environment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'byway-env-names-'));

  it('names every variable the file listed into that environment, set or kept, and nothing for another environment', () => {
    const file = join(dir, '.env.agents');
    writeFileSync(file, 'ANTHROPIC_API_KEY=sk-ant-file\nODD_CREDENTIAL=hunter2\nOPENAI_API_KEY=sk-file\n');
    const env: Record<string, string | undefined> = { OPENAI_API_KEY: 'sk-shell', PATH: '/bin' };
    loadEnvFile(file, env);
    expect(namesFromEnvFile(env).sort()).toEqual(['ANTHROPIC_API_KEY', 'ODD_CREDENTIAL', 'OPENAI_API_KEY']);
    expect(namesFromEnvFile({ ...env })).toEqual([]);
    expect(withoutSecrets(env, namesFromEnvFile(env))).toEqual({ PATH: '/bin' });
  });

  it('names nothing when the file does not exist', () => {
    const env: Record<string, string | undefined> = {};
    loadEnvFile(join(dir, 'absent.env'), env);
    expect(namesFromEnvFile(env)).toEqual([]);
  });
});
