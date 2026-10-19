// Where and at what depth does composed-recipe admission overflow the stack? (verify-F02-reproduce; writes nothing)
const R = 'file:///C:/Users/arvik/code/byway/packages';
const { c1, PROTOCOL_CONFIGS } = await import(`${R}/catalog/src/index.ts`);
const { createPromptRenderer } = await import(`${R}/prompts/src/index.ts`);
const { checkAnswer } = await import(`${R}/advisor/src/index.ts`);
const prompts = createPromptRenderer();
const wrap = (depth: number) => {
  const raw = structuredClone(c1) as any;
  let body = raw.stages[2].body;
  for (let i = 0; i < depth; i++) body = { op: 'seq', steps: [body] };
  raw.stages[2].body = body;
  return raw;
};
const out: any[] = [];
for (const depth of [600, 700, 800, 900, 1000, 1100, 1200]) {
  const text = JSON.stringify(wrap(depth));
  try {
    const a = checkAnswer(text, c1, { prompts, catalog: PROTOCOL_CONFIGS }, 'composed-depth');
    out.push({ depth, bytes: text.length, ok: !!a.recipe && a.violations.length === 0 });
  } catch (e: any) {
    const frames = String(e?.stack).split('\n').slice(1, 6).map((s) => s.trim().replace(/\(file:\/\/\/C:\/Users\/arvik\/code\/byway\//, '(').slice(0, 140));
    out.push({ depth, bytes: text.length, threw: `${e?.name}: ${e?.message}`, topFrames: frames });
  }
}
console.log(JSON.stringify(out, null, 2));
