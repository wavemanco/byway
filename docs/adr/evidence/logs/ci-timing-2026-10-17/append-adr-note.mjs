// Fills in the ADR-0103 note's last facts and appends it, as a new bullet, to the end of the record (its "Later notes").
import { readFileSync, writeFileSync } from 'node:fs';

const B = 'C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ci-timing/build';
const ADR = 'C:/Users/arvik/code/byway/.worktrees/fx-ci-timing/docs/adr/0103-adr-log-rule-and-ci.md';
let note = readFileSync(`${B}/adr-note.md`, 'utf8');
const rep = (a, b) => {
  if (note.split(a).length !== 2) throw new Error(`once: ${a}`);
  note = note.replace(a, () => b);
};
rep(
  'LOAD_SENTENCE ',
  "With 32 busy processes on the owner's 16-thread machine all 54 tests in the file pass, and with Chromium's CPU throttled 4 times the five pass. Throttled 20 times, the old right-to-left test fails at the read's 30 s deadline, and the new one passes in 49.5 s. ",
);
rep(
  "A response ended by the fetch's own limit instead reaches the page as a failed load, not a blocked one, which the old time limit let through.",
  "A response ended by the fetch's own limit instead reaches the page aborted, not blocked, which the old time limit let through.",
);
writeFileSync(`${B}/adr-note.md`, note);
const s = readFileSync(ADR, 'utf8');
if (!s.endsWith('\n')) throw new Error('no final newline');
if (!s.trimEnd().split('\n').slice(-3).join('\n').includes('The README\'s CI section shows the steps.')) throw new Error('the record does not end as expected');
writeFileSync(ADR, s + note);
console.log('appended');
