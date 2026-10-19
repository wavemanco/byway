// Applies one named mutation to a source file of the worktree (exactly one occurrence of the original text), or
// restores the file from the backup taken before. Usage: node mutate.mjs <apply|restore> <id>
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/arvik/code/byway/.worktrees/fx-ci-timing/packages/runner/src';
const BACKUP = 'C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ci-timing/build/backup';

const M = {
  // The render's deadline: no timer, so nothing ends a render whose page never settles.
  'M1-no-deadline': ['pages.ts', 'timer = setTimeout(() => reject(late(left < timeout)), Math.max(left, 0));', '/* M1: no deadline */'],
  // Closing a stuck page's context is waited out, not bounded.
  'M2-context-close-unbounded': ['pages.ts', "const closed = await Promise.race([context.close().then(() => 'closed' as const, () => 'closed' as const), sleep(closeTimeout)]);", "const closed = await context.close().then(() => 'closed' as const, () => 'closed' as const);"],
  // Closing the browser after a context that would not close is waited out, not bounded.
  'M3-browser-close-unbounded': ['pages.ts', 'await Promise.race([b.close().catch(() => undefined), sleep(closeTimeout)]);', 'await b.close().catch(() => undefined);'],
  // The browser whose context would not close is not forgotten, so the next render uses it again.
  'M4-browser-not-forgotten': ['pages.ts', 'if (browser && (await browser.catch(() => undefined)) === b) browser = undefined;', '/* M4: not forgotten */'],
  // A render that failed plainly is made once more.
  'M5-render-retried': ['pages.ts', '    } catch (e) {\n      throw drawFailure(e, renderOpts.signal);\n    }\n  };', "    } catch (e) {\n      if (e instanceof StepError && !(renderOpts as { again?: boolean }).again) return render(html, resolve, surfaces, { ...renderOpts, again: true } as RenderOptions);\n      throw drawFailure(e, renderOpts.signal);\n    }\n  };"],
  // A cancel that comes during the render is not listened for.
  'M6-cancel-ignored': ['pages.ts', "else signal.addEventListener('abort', onAbort, { once: true });", '/* M6: abort not listened for */'],
  // The byte cap is not applied to a body as it streams (one with a content-length over the cap is still refused).
  'M7-no-stream-cap': ['render-fetch.ts', '    if (total > cap) {\n      await reader.cancel().catch(() => undefined);\n      return undefined;\n    }\n', '    /* M7: no cap */\n'],
  // The byte cap is not applied as the body streams, and the fetch gives up after 3 s instead: the endless response
  // is ended by the fetch's own limit, not cut at the cap, and the page gets a 404 for it.
  'M7b-cut-by-fetch-limit-not-cap': ['render-fetch.ts', '    if (total > cap) {\n      await reader.cancel().catch(() => undefined);\n      return undefined;\n    }\n', '    /* M7b: no cap */\n', 'pages.ts', 'const signal = AbortSignal.timeout(timeout);', 'const signal = AbortSignal.timeout(3_000);'],
  // (First form, which passed: this line is never reached on a page where nothing changes, as the shortcut below
  // returns first. Kept for the record.)
  'M8a-sample-remeasures': ['pages.ts', '      if (!fresh && had.at === at) continue;\n', '      /* M8a: measured again at every sample */\n'],
  // A sample looks at the page again although nothing on it changed (r11's shortcut; D4's checker's P1).
  'M8a2-sample-looks-again': ['pages.ts', '    if (!changed && !animations.length) return 0;\n', '    /* M8a2: looks again */\n'],
  // A sample measures every text node again, changed or not (both of r11's checks gone).
  'M8a3-sample-remeasures-all': ['pages.ts', '    if (!changed && !animations.length) return 0;\n', '    /* M8a3: looks again */\n', 'pages.ts', '      if (!fresh && had.at === at) continue;\n', '      /* M8a3: measured again */\n'],
  // The end of the read measures every node shown again, moved or not.
  'M8b-final-remeasures': ['pages.ts', 'if (last) fin = rec.at0 === null || last.at === rec.at0 ? rec : P.measure(t);', 'if (last) fin = P.measure(t);'],
  // Where right-to-left text is involved, two words in one flow of text are glued whatever the space between shows.
  'M8c-words-glued': ['pages.ts', 'gap = flow && spaceShows(i, j, tol, ax) ? Infinity : 0;', 'gap = 0;'],
  // The shared deadline is ignored: a read has its renderer's whole limit.
  'M9-shared-deadline-ignored': ['pages.ts', 'const left = deadline === undefined ? timeout : Math.min(timeout, deadline - Date.now());', 'const left = timeout;'],
  // The shared deadline's message is kept, but the timer runs for the renderer's whole limit.
  'M9b-timer-ignores-shared-deadline': ['pages.ts', 'timer = setTimeout(() => reject(late(left < timeout)), Math.max(left, 0));', 'timer = setTimeout(() => reject(late(left < timeout)), timeout);'],
};

const [, , action, id] = process.argv;
const m = M[id];
if (!m) throw new Error(`no mutation ${id}`);
const pairs = [];
for (let k = 0; k < m.length; k += 3) pairs.push(m.slice(k, k + 3));
const backedUp = new Set();
for (const [file, from, to] of pairs) {
  const full = path.join(ROOT, file);
  const backup = path.join(BACKUP, `${file}.orig`);
  if (action === 'apply') {
    if (existsSync(backup) && !backedUp.has(file)) throw new Error(`backup exists for ${file}: restore first`);
    const text = readFileSync(full, 'utf8');
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error(`${id}: expected one occurrence in ${file}, found ${n}`);
    if (!backedUp.has(file)) copyFileSync(full, backup);
    backedUp.add(file);
    writeFileSync(full, text.replace(from, () => to));
    console.log(`applied ${id} to ${file}`);
  } else if (action === 'restore') {
    if (!existsSync(backup)) continue;
    copyFileSync(backup, full);
    unlinkSync(backup);
    console.log(`restored ${file}`);
  } else throw new Error(`unknown action ${action}`);
}
