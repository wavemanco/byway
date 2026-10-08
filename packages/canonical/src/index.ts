import { createHash } from 'node:crypto';

/** Thrown when a value cannot be represented as RFC 8785 canonical JSON, or text cannot be hashed. */
export class CanonicalizationError extends Error {
  override name = 'CanonicalizationError';
}

/**
 * RFC 8785 (JSON Canonicalization Scheme). Object keys are sorted by UTF-16 code units (JavaScript's default string
 * ordering), there is no whitespace, and primitives use ECMAScript JSON.stringify serialization, which RFC 8785 adopts
 * for numbers and strings. Strings, property names included, must be well-formed Unicode (RFC 8785 §3.2.2.2): a lone
 * surrogate is an error, not something to escape.
 */
export function canonicalize(value: unknown): string {
  return serialize(value, new Set<object>(), '$');
}

/**
 * The one string serializer, for values and property names alike (RFC 8785 §3.2.2.2 covers both). `where` names the
 * string in the error, and is itself well-formed: callers escape any name they quote in it.
 */
function serializeString(s: string, where: string): string {
  if (!s.isWellFormed()) throw new CanonicalizationError(`${where} contains a lone surrogate`);
  return JSON.stringify(s);
}

function serialize(value: unknown, ancestors: Set<object>, path: string): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return serializeString(value, `${path}: string`);
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
        // The name is checked before its value is walked, so every path handed down holds only names that passed, and
        // every error message stays well-formed text (the bad name itself is quoted escaped).
        const name = serializeString(key, `${path}: property name ${JSON.stringify(key)}`);
        const v = (value as Record<string, unknown>)[key];
        return `${name}:${serialize(v, ancestors, `${path}.${key}`)}`;
      });
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Lowercase hex SHA-256 of the UTF-8 encoding of `text`. Text must be well-formed: a lone surrogate has no UTF-8
 * encoding, and Node would silently hash it as U+FFFD, so two different texts would share one hash.
 */
export function sha256Hex(text: string): string {
  if (!text.isWellFormed()) throw new CanonicalizationError('text to hash contains a lone surrogate, so it has no UTF-8 encoding');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Content address of a JSON value: `sha256:` + SHA-256 of its canonical form. */
export function contentHash(value: unknown): string {
  return `sha256:${sha256Hex(canonicalize(value))}`;
}
