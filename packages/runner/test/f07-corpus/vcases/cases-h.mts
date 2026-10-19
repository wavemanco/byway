// Round-12 verifier, hand cases H: white-space-kept breaks in lines with a repeated word (placement's fallback to single
// spaces, a312620) on opening hours as a model writes them.
const set = (o: string[], i: number, t: string) => o.map((l, k) => (k === i ? t : l));
const setRe = (re: RegExp, f: (l: string) => string) => (o: string[]) => { const i = o.findIndex((l) => re.test(l)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
export const CASES = [
  { name: 'hours-repeat-first', html: '<p style="white-space:pre-line">Mon 9–5\nTue 9–5\nWed closed</p>', edit: setRe(/Mon/, (l) => l.replace('Mon', 'Monday')) },
  { name: 'hours-repeat-time', html: '<p style="white-space:pre-line">Mon 9–5\nTue 9–5\nWed closed</p>', edit: setRe(/Mon/, (l) => l.replace('Tue 9–5', 'Tue 9–6')) },
  { name: 'hours-repeat-last', html: '<p style="white-space:pre-line">Mon 9–5\nTue 9–5\nWed closed</p>', edit: setRe(/Mon/, (l) => l.replace('closed', '10–4')) },
  { name: 'hours-repeat-days', html: '<p class="hours" style="white-space:pre-line">Weekdays 8am – 6pm\nWeekends 9am – 6pm\nHolidays closed</p>', edit: setRe(/Weekdays/, (l) => l.replace('8am', '7am')) },
  { name: 'address-repeat', html: '<address style="white-space:pre-line">Unit 4, Mill Yard\nMill Lane\nLeeds LS1 4AB</address>', edit: setRe(/Unit/, (l) => l.replace('Unit 4', 'Unit 5')) },
  { name: 'gen-repeat', html: '<p style="white-space:pre-line">Fresh\nFresh bread Blue\nSign</p>', edit: setRe(/Fresh/, () => '(soon) Fresh bread Blue Sign') },
];
