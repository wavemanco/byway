// Usage: node mutate.cjs <apply|restore> <name>. Applies one named mutation to the worktree (backing the file up), or restores it.
const fs = require('fs');
const path = require('path');
const root = 'C:/Users/arvik/code/byway/.worktrees/fx-b2-wcore/';
const bak = 'C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/b1-chunk3/mut/';
const I = 'packages/runner/src/workflow/interpreter.ts';
const H = 'packages/runner/src/activities/human.ts';
const M = {
  'no-carry': [I, '        this.carried = new Map(this.answers);\n', ''],
  'unchanged-vs-box': [H, 'const unchanged = input.deckId !== undefined ? await reader.ownText(input.deckId, unreadableDeck(input.deckId)) : input.initialText;', 'const unchanged = input.initialText;'],
  'labelled-as-prose': [H, "if (from === 'claims' || (kind !== 'options' && kind !== 'on-screen')) return sameCopy(medium, scope, answered, deck);", 'return sameCopy(medium, scope, answered, deck);'],
  'keep-unchanged-answer': [H, 'if (sameCopy(medium, scope, answered, answer) || sameCopy(medium, scope, q.deck, answer)) return asBefore;', 'if (sameCopy(medium, scope, q.deck, answer)) return asBefore;'],
  'page-prefilled': [H, "? asBefore : { box: q.deck, note: earlierNote(true, answered, answer) };", "? asBefore : { box: answer, note: '' };"],
  'place-no-path': [I, "const placeOf = (s: Step, ctx: Ctx): string => `${s.id}|${ctx.path.length ? ctx.path.join('.') : '-'}`;", "const placeOf = (s: Step, _ctx: Ctx): string => `${s.id}|-`;"],
  'carried-kept': [I, '      if (earlier) this.carried.delete(place);\n', ''],
  'no-deck-kept': [H, '    if (deckId !== undefined) result.deckId = deckId;\n', ''],
  'ask-drops-deck': [I, ', ...(opened.deckId !== undefined ? { deckId: opened.deckId } : {}) };', ' };'],
  'no-quotes': [H, "const quoted = theirs.length ? ", "const quoted = theirs.length < 0 ? "],
  'deck-unchanged-ignored': [H, "  if (from === 'claims' || (kind !== 'options' && kind !== 'on-screen')) return sameCopy(medium, scope, answered, deck);", "  if (from === 'claims' || (kind !== 'options' && kind !== 'on-screen')) return true;"],
};
const [cmd, name] = process.argv.slice(2);
const [file, from, to] = M[name];
const p = path.join(root, file);
const b = path.join(bak, path.basename(file) + '.bak');
if (cmd === 'apply') {
  const s = fs.readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`anchor not found for ${name}`);
  fs.writeFileSync(b, s);
  fs.writeFileSync(p, s.replace(from, to));
} else {
  fs.writeFileSync(p, fs.readFileSync(b, 'utf8'));
}
