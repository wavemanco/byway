import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ZodError } from 'zod';
import { parseRecipe, recipeHash, type Recipe } from '@byway/recipe';
import { validate } from '@byway/validator';

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = [
  'usage: byway <command> <file>',
  '  validate <recipe.json>   check a recipe against the protocol rules (exit 0 ok, 1 violations, 2 unreadable)',
  '  hash <recipe.json>       print the recipe content hash',
].join('\n');

class InputError extends Error {}

function load(file: string): Recipe {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    throw new InputError(`cannot read ${file}: ${(e as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new InputError(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  try {
    return parseRecipe(json);
  } catch (e) {
    if (e instanceof ZodError) {
      const issues = e.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
      throw new InputError(`${file} is not a valid recipe:\n${issues}`);
    }
    throw e;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await run(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
  process.exit(code);
}
