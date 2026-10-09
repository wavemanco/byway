import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { parseRecipe, recipeHash, type Recipe } from '@byway/recipe';
import { validate } from '@byway/validator';
import { JsonInputError, checkStructure, decode } from './json.ts';

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = [
  'usage: byway <command> <file>',
  '  validate <recipe.json>   check a recipe against the protocol rules (exit 0 ok, 1 violations, 2 unreadable or not a recipe)',
  '  hash <recipe.json>       print the recipe content hash (exit 0 ok, 2 unreadable or not a recipe)',
].join('\n');

class InputError extends Error {}

function load(file: string): Recipe {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(file);
  } catch (e) {
    throw new InputError(`cannot read ${file}: ${(e as Error).message}`);
  }
  try {
    const text = decode(bytes, file);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new InputError(`${file} is not valid JSON: ${(e as Error).message}`);
    }
    checkStructure(text, file);
    return parseRecipe(json);
  } catch (e) {
    if (e instanceof InputError) throw e;
    if (e instanceof JsonInputError) throw new InputError(e.message);
    if (e instanceof ZodError) {
      const issues = e.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
      throw new InputError(`${file} is not a valid recipe:\n${issues}`);
    }
    // Anything else from parsing (for example a stack overflow on pathological input) is still unreadable input.
    throw new InputError(`${file} could not be parsed: ${(e as Error).message}`);
  }
}

/** True when this module is the program entry, also when launched through a symlink or junction. */
export function isEntry(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  try {
    const a = realpathSync(argv1);
    const b = realpathSync(fileURLToPath(moduleUrl));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}

function validateCommand(file: string, io: Io): number {
  const recipe = load(file);
  const verdict = validate(recipe);
  const lines: string[] = [];
  const hashMismatch = recipe.hash !== undefined && recipe.hash !== verdict.recipeHash;
  if (hashMismatch) lines.push(`hash mismatch: file says ${recipe.hash}, content is ${verdict.recipeHash}`);
  for (const v of verdict.violations) lines.push(`${v.ruleId} [${v.class}] ${v.path}: ${v.message}`);
  for (const w of verdict.warnings) lines.push(`warning ${w.ruleId} ${w.path}: ${w.message}`);
  const ok = verdict.ok && !hashMismatch;
  io.out(`${ok ? 'ok' : 'FAIL'} ${recipe.id} ${verdict.recipeHash}`);
  if (verdict.exceptionsUsed.length) io.out(`exceptions used: ${verdict.exceptionsUsed.join(', ')}`);
  if (verdict.suspended.length) io.out(`suspended by derivation: ${verdict.suspended.join(', ')}`);
  for (const line of lines) io.out(line);
  return ok ? 0 : 1;
}

/** Run the CLI. Returns the process exit code. */
export async function run(argv: string[], io: Io): Promise<number> {
  const [command, file] = argv;
  if (!file || (command !== 'validate' && command !== 'hash')) {
    io.err(USAGE);
    return 2;
  }
  try {
    if (command === 'hash') {
      io.out(recipeHash(load(file)));
      return 0;
    }
    return validateCommand(file, io);
  } catch (e) {
    if (e instanceof InputError) {
      io.err(e.message);
      return 2;
    }
    throw e;
  }
}

if (isEntry(import.meta.url, process.argv[1])) {
  const code = await run(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
  process.exit(code);
}
