const R = 'file:///C:/Users/arvik/code/byway';
const { c4, PROTOCOL_CONFIGS } = await import(`${R}/packages/catalog/src/index.ts`);
const { createPromptRenderer } = await import(`${R}/packages/prompts/src/index.ts`);
const { checkAnswer } = await import(`${R}/packages/advisor/src/index.ts`);
for (const depth of [1000, 1200, 1500, 2000]) {
  const leafJson = JSON.stringify(c4.stages[0].body);
  const bodyJson = '{"op":"seq","steps":['.repeat(depth) + leafJson + ']}'.repeat(depth);
  const raw: any = structuredClone(c4); raw.stages[0].body = '__BODY__';
  const json = JSON.stringify(raw).replace('"__BODY__"', bodyJson);
  try { const a = checkAnswer(json, c4, { prompts: createPromptRenderer(), catalog: PROTOCOL_CONFIGS }, 'd'); console.log(depth, json.length, 'violations', a.violations.length, a.violations[0]?.ruleId ?? ''); }
  catch (e: any) { console.log(depth, json.length, e.name, (e.stack ?? '').split('\n').slice(1, 4).map((s: string) => s.trim()).join(' | ')); }
}
