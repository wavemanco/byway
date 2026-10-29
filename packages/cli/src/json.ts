/** Strict reading of recipe JSON files: encodings and duplicate keys (parseRecipe's shape check bounds the nesting). */

export class JsonInputError extends Error {}

/** Decode file bytes as UTF-8 (a UTF-8 BOM is dropped). UTF-16 and invalid UTF-8 are rejected with a clear message. */
export function decode(bytes: Uint8Array, file: string): string {
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    throw new JsonInputError(`${file} is UTF-16; save it as UTF-8`);
  }
  try {
    // ignoreBOM: false (the default) strips a leading UTF-8 BOM, which PowerShell 5.1 and older editors write.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new JsonInputError(`${file} is not valid UTF-8`);
  }
}

/**
 * Reject objects that repeat a key. JSON.parse silently keeps the last duplicate, so a reader of the file could see a
 * different value from the one that is hashed. Iterative, so any nesting is safe here; parseRecipe refuses nesting
 * deeper than SHAPE_LIMITS.depth. Call only on text that JSON.parse has already accepted.
 */
export function checkStructure(text: string, file: string): void {
  const stack: (Set<string> | null)[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '{' || c === '[') {
      stack.push(c === '{' ? new Set() : null);
      i += 1;
    } else if (c === '}' || c === ']') {
      stack.pop();
      i += 1;
    } else if (c === '"') {
      const start = i;
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      i += 1;
      let j = i;
      while (j < text.length && /\s/.test(text[j]!)) j += 1;
      const keys = stack[stack.length - 1];
      if (text[j] === ':' && keys) {
        const key = JSON.parse(text.slice(start, i)) as string;
        if (keys.has(key)) throw new JsonInputError(`${file} repeats the key "${key}" in one object`);
        keys.add(key);
      }
    } else {
      i += 1;
    }
  }
}
