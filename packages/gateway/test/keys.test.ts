/**
 * The held-key detector (ADR-0088): the one exact rule for "does this text hold a provider key byway has", shared by
 * the gateway's crossings and the web's request bodies. It names the variable, never the value.
 */
import { GatewayError } from '@byway/contracts';
import { describe, expect, it } from 'vitest';
import { findHeldKey, heldKeyError, isHeldKeyError, makeRedactor } from '../src/index.ts';

const ANTHROPIC = 'sk-ant-api03-test-not-a-real-key-000000';
const FAL_ID = '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6';
const FAL_SECRET = '00112233445566778899aabbccddeeff';
const env = { ANTHROPIC_API_KEY: ANTHROPIC, FAL_KEY: `${FAL_ID}:${FAL_SECRET}`, GITHUB_TOKEN: 'ghp_not-a-provider-key-0000000000', OPENAI_API_KEY: 'short-key' };

describe('findHeldKey', () => {
  it('names the provider variable whose exact value appears in any of the texts', () => {
    expect(findHeldKey(env, ['nothing here', `my key is ${ANTHROPIC}, use it`])).toBe('ANTHROPIC_API_KEY');
    expect(findHeldKey(env, [undefined, `fal: ${FAL_ID}:${FAL_SECRET}`])).toBe('FAL_KEY');
  });

  it("finds a FAL_KEY by either ':'-separated half on its own, so its secret cannot pass alone", () => {
    expect(findHeldKey(env, [`the secret is ${FAL_SECRET}`])).toBe('FAL_KEY');
    expect(findHeldKey(env, [`the id is ${FAL_ID}`])).toBe('FAL_KEY');
  });

  it('ignores variables that are not provider keys, values under 16 characters, and key-shaped text byway does not hold', () => {
    expect(findHeldKey(env, [env.GITHUB_TOKEN])).toBeUndefined();
    expect(findHeldKey(env, ['short-key appears here'])).toBeUndefined();
    expect(findHeldKey(env, ['The fixture uses sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX as a placeholder.'])).toBeUndefined();
    expect(findHeldKey({}, [ANTHROPIC])).toBeUndefined();
    // Parts of a ':'-separated value under 16 characters are not candidates on their own.
    expect(findHeldKey({ FAL_KEY: 'short:also-short' }, ['short and also-short'])).toBeUndefined();
  });

  it('reads the environment when called, so a key added later is covered', () => {
    const live: Record<string, string | undefined> = {};
    expect(findHeldKey(live, [ANTHROPIC])).toBeUndefined();
    live.ANTHROPIC_API_KEY = ` ${ANTHROPIC} `;
    expect(findHeldKey(live, [ANTHROPIC])).toBe('ANTHROPIC_API_KEY');
  });

  it('never returns the value itself', () => {
    const found = findHeldKey(env, [ANTHROPIC, FAL_SECRET]);
    expect(found).not.toContain(ANTHROPIC);
    expect(found).not.toContain(FAL_SECRET);
  });
});

describe('the held-key marker', () => {
  it('is a GatewayError with the variable name, and is recognised by shape across bundles', () => {
    const err = heldKeyError('invalid-request', 'This request contains your ANTHROPIC_API_KEY.', 'ANTHROPIC_API_KEY');
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ name: 'GatewayError', code: 'invalid-request', retryable: false, heldKey: 'ANTHROPIC_API_KEY' });
    expect(isHeldKeyError(err)).toBe(true);
    // Another server bundle's GatewayError class is a different object: the name and the marker are what count.
    expect(isHeldKeyError({ name: 'GatewayError', code: 'provider-error', message: 'x', heldKey: 'FAL_KEY' })).toBe(true);
    expect(isHeldKeyError(new GatewayError('invalid-request', 'plain'))).toBe(false);
    expect(isHeldKeyError({ name: 'Error', heldKey: 'FAL_KEY' })).toBe(false);
    expect(isHeldKeyError(undefined)).toBe(false);
  });
});

describe('makeRedactor', () => {
  it("scrubs each ':'-part of a held key too, so diagnostic copies are never narrower than the refusal rule", () => {
    const redact = makeRedactor(env);
    expect(redact(`secret ${FAL_SECRET} and id ${FAL_ID}`)).toBe('secret [redacted] and id [redacted]');
    expect(redact(`whole ${FAL_ID}:${FAL_SECRET}`)).toBe('whole [redacted]');
  });
});
