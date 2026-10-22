/**
 * The shape bound of `byway.recipe/1` (F02, ADR-0092 stage 2): how deep, how many nodes and how large a recipe may be
 * at all, checked before anything walks it. It prevents crashes, not work: every reader of a recipe (the schema, the
 * reserved-key walk, hashing, the validator, the interpreter) recurses through it, and a model's answer of about a
 * thousand nested steps used to overflow the stack in the reserved-key walk with an uncaught RangeError instead of a
 * schema finding. What a recipe may make a run do is bounded separately, by the engine's limits (limits.ts).
 *
 * The walk here is iterative (an explicit stack), so it cannot overflow on the input it exists to refuse, and it stops
 * at the first bound it meets, so a cyclic or enormous object costs no more than the bound.
 *
 * Pure: no imports, no Node built-ins.
 */

export const SHAPE_LIMITS = {
  /**
   * Nesting of the raw JSON (objects and arrays). The catalog's deepest recipe is 14; 64 leaves room for about 25
   * levels of operators, twice the composed limit (limits.ts COMPOSED_LIMITS.depth).
   */
  depth: 64,
  /** Recipe nodes: objects carrying an `op` (steps, operators, a pick's judge). The catalog's largest has 42. */
  nodes: 10_000,
  /** The recipe as UTF-8 JSON. The catalog's largest is 6.3 KB. */
  bytes: 1024 * 1024,
} as const;

export interface ShapeProblem {
  /** Where the bound was met: the path of the value that went over it (empty for the whole recipe). */
  path: (string | number)[];
  message: string;
}

/**
 * A property name as a finding's path shows it: each lone surrogate written as \uXXXX text, as the canonicalizer quotes
 * a bad property name (JSON.stringify), so the path is well-formed text wherever it is shown or written. A lone
 * surrogate arrives as a JSON backslash-u escape in a model's answer or a file. A well-formed name is returned as it is.
 */
export function pathName(name: string): string {
  return name.isWellFormed() ? name : name.replace(/\p{Cs}/gu, (s) => `\\u${s.charCodeAt(0).toString(16)}`);
}

/** UTF-8 bytes of a string, without allocating its encoding. */
function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** About what one primitive adds to the JSON: its text and quotes (its container counts the separators). */
function primitiveBytes(v: unknown): number {
  if (typeof v === 'string') return utf8Length(v) + 2;
  if (typeof v === 'number' || typeof v === 'bigint') return String(v).length;
  return 5;
}

/**
 * The first shape bound the input goes over, or undefined. The byte count is the JSON's length without escapes, a
 * little under the serialized size: a bound against runaway input, where a few percent do not matter.
 */
export function shapeProblem(input: unknown): ShapeProblem | undefined {
  let nodes = 0;
  let bytes = 0;
  // Each entry: a value, its path and its depth (1 for the recipe object itself).
  const stack: { value: unknown; path: (string | number)[]; depth: number }[] = [{ value: input, path: [], depth: 1 }];
  while (stack.length) {
    const { value, path, depth } = stack.pop()!;
    if (value === null || typeof value !== 'object') {
      bytes += primitiveBytes(value);
    } else {
      if (depth > SHAPE_LIMITS.depth) return { path, message: `the recipe nests deeper than ${SHAPE_LIMITS.depth} levels here` };
      // Every element or member adds at least two bytes, so a container that long is over before it is unpacked.
      const size = Array.isArray(value) ? value.length : Object.keys(value).length;
      bytes += 2 + 2 * size;
      if (bytes > SHAPE_LIMITS.bytes) return { path: [], message: `the recipe is larger than ${SHAPE_LIMITS.bytes / 1024 / 1024} MiB` };
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) stack.push({ value: value[i], path: [...path, i], depth: depth + 1 });
      } else {
        const keys = Object.keys(value);
        if (keys.includes('op')) nodes++;
        if (nodes > SHAPE_LIMITS.nodes) return { path, message: `the recipe has more than ${SHAPE_LIMITS.nodes} steps and operators` };
        for (let i = keys.length - 1; i >= 0; i--) {
          const k = keys[i]!;
          bytes += utf8Length(k) + 2;
          stack.push({ value: (value as Record<string, unknown>)[k], path: [...path, pathName(k)], depth: depth + 1 });
        }
      }
    }
    if (bytes > SHAPE_LIMITS.bytes) return { path: [], message: `the recipe is larger than ${SHAPE_LIMITS.bytes / 1024 / 1024} MiB` };
  }
  return undefined;
}
