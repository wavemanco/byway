import { createHash } from 'node:crypto';

/** Thrown when a value cannot be represented as RFC 8785 canonical JSON. */
export class CanonicalizationError extends Error {
  override name = 'CanonicalizationError';
}

/**
 * RFC 8785 (JSON Canonicalization Scheme). Object keys are sorted by UTF-16
 * code units (JavaScript's default string ordering), there is no whitespace,
 * and primitives use ECMAScript JSON.stringify serialization, which RFC 8785
 * adopts for numbers and strings.
 */
export function canonicalize(value: unknown): string {
  return serialize(value, new Set<object>(), '$');
}

function serialize(value: unknown, ancestors: Set<object>, path: string): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    // RFC 8785 §3.2.2.2: lone surrogates are an error, not something to escape.
    if (!value.isWellFormed()) throw new CanonicalizationError(`${path}: string contains a lone surrogate`);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalizationError(`${path}: ${value} is not representable in JSON`);
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new CanonicalizationError(`${path}: values of type ${typeof value} are not JSON`);
  }
  if (ancestors.has(value)) {
    throw new CanonicalizationError(`${path}: cyclic structure`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      // Index loop, not map(): map() skips holes, which would turn a sparse array into invalid JSON.
      const items: string[] = [];
      for (let i = 0; i < value.length; i++) items.push(serialize(value[i], ancestors, `${path}[${i}]`));
      return `[${items.join(',')}]`;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      // Date, Map, class instances… would all serialize as "{}" and collide.
      throw new CanonicalizationError(`${path}: only plain objects and arrays are JSON (got ${value.constructor?.name ?? 'an exotic object'})`);
    }
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const v = (value as Record<string, unknown>)[key];
        return `${JSON.stringify(key)}:${serialize(v, ancestors, `${path}.${key}`)}`;
      });
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Lowercase hex SHA-256 of the UTF-8 encoding of `text`. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Content address of a JSON value: `sha256:` + SHA-256 of its canonical form. */
export function contentHash(value: unknown): string {
  return `sha256:${sha256Hex(canonicalize(value))}`;
}
