/**
 * Every string in a parsed JSON value, object property names included: a request body can carry text in a record's
 * keys as well as its values (StartInput.routes), and the held-key check (ADR-0088) must see both.
 */
export function* stringsIn(value: unknown): Generator<string> {
  if (typeof value === 'string') {
    yield value;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) yield* stringsIn(item);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      yield key;
      yield* stringsIn(item);
    }
  }
}
