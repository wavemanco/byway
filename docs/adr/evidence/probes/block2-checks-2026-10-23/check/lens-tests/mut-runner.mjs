const RELAY = 'packages/runner/src/activities/relay.ts';
const INT = 'packages/runner/src/workflow/interpreter.ts';
const HUMAN = 'packages/runner/src/activities/human.ts';
const waitsT = ['packages/runner/test/step-limits.test.ts', 'packages/runner/test/caps.test.ts', 'packages/runner/test/memo.test.ts'];
const heldT = ['packages/runner/test/held-voice-writers.test.ts', 'packages/runner/test/held-voice.test.ts'];
const retryT = ['packages/runner/test/voice-retry.test.ts', 'packages/runner/test/page-voice-prompt.test.ts'];
export default [
  { id: 'R2', file: RELAY, from: 'profile?.tiers[relayTier(step)]', to: 'profile?.tiers.mid', tests: waitsT },
  { id: 'R8', file: RELAY, from: "ref && ref.provider !== 'mock' ?", to: 'ref ?', tests: waitsT },
  { id: 'R9', file: 'packages/runner/src/caps.ts', from: 'w.provider === ref.provider && w.model === ref.model', to: 'w.model === ref.model', tests: waitsT },
  { id: 'R3', file: RELAY, from: '    waitMs: waits.linkMs,\n', to: '', tests: waitsT },
  { id: 'M1', file: 'packages/runner/src/activities/memo.ts', from: 'const key = keyOf(kind, asked);', to: 'const key = keyOf(kind, request);', tests: waitsT },
  { id: 'M2', file: 'packages/runner/src/activities/memo.ts', from: '...opts.operation, ...ownWait, ', to: '...opts.operation, ', tests: waitsT },
  { id: 'H1', file: 'packages/runner/src/activities/asset.ts', from: 'step.keepsVoice ? await keptVoice(reader, ports) : undefined, current);', to: 'undefined, current);', tests: heldT },
  { id: 'H2', file: RELAY, from: 'step.keepsVoice ? await keptVoice(reader, ports) : undefined, storyboardText);', to: 'undefined, storyboardText);', tests: heldT },
  { id: 'H3', file: 'packages/runner/src/activities/model-step.ts', from: 'const voice = step.keepsVoice ? await keptVoice(reader, input.ports) : undefined;', to: 'const voice = undefined;', tests: heldT },
  { id: 'H4', file: 'packages/runner/src/activities/held-voice.ts', from: 'const ids = [...(ports.held ?? []), ...(ports.voice !== undefined ? [ports.voice] : [])];', to: 'const ids = [...(ports.voice !== undefined ? [ports.voice] : [])];', tests: heldT },
  { id: 'V1', file: INT, from: '        this.carried = new Map(this.answers);\n', to: '', tests: retryT },
  { id: 'V2', file: INT, from: '      if (earlier) this.carried.delete(place);\n', to: '', tests: retryT },
  { id: 'V3', file: INT, from: "const placeOf = (s: Step, ctx: Ctx): string => `${s.id}|${ctx.path.length ? ctx.path.join('.') : '-'}`;", to: 'const placeOf = (s: Step, _ctx: Ctx): string => `${s.id}|-`;', tests: retryT },
  { id: 'V5', file: HUMAN, from: 'const unchanged = input.deckId !== undefined ? await reader.ownText(input.deckId, unreadableDeck(input.deckId)) : input.initialText;', to: 'const unchanged = input.initialText;', tests: retryT },
  { id: 'V7', file: HUMAN, from: "if (from === 'claims' || (kind !== 'options' && kind !== 'on-screen')) return sameCopy(medium, scope, answered, deck);", to: "if (from === 'claims' || (kind !== 'options' && kind !== 'on-screen')) return true;", tests: retryT },
];
