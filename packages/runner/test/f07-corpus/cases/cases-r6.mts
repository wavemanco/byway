const all = (lines: string[]) => () => ['T', ...lines];
const full = (lines: string[]) => () => lines;
export const CASES = [
  // P1 (blocking in r6): controls left nameless with a hidden span
  { name: 'P1 submit button, label deleted, hidden Sending', html: '<form><p>Ready? <button type="submit"><span>Send</span><span hidden>Sending…</span></button> We reply within a day.</p></form>', edit: (o: string[]) => o.map((l) => (l === 'Send' ? '' : l)) },
  { name: 'P1 C1 link with hidden span emptied', html: '<p>Go <a href="/x">Read<span hidden> more</span></a> now</p>', edit: all(['Go [] now']) },
  { name: 'P1 C2 button with hidden span emptied', html: '<p>Go <button type="button">Send<span hidden> it</span></button> now</p>', edit: all(['Go', '', 'now']) },
  { name: 'P1 icon button hidden span', html: '<p>Menu <button type="button"><svg width="9" height="9"></svg><span hidden>Open</span>Open menu</button> here</p>', edit: (o: string[]) => o.map((l) => (l === 'Open menu' ? '' : l)) },
  // P2 explicit body after implicit body
  { name: 'P2 H1 head text then body h2 deleted', html: '<!doctype html><html><head><title>T</title>Welcome</head><body><h2>Sale</h2>Order today</body></html>', edit: full(['T', 'Welcome', '', 'Order today']) },
  { name: 'P2 H2', html: '<!doctype html><title>T</title>Welcome<body><h2>Sale</h2>Order today', edit: full(['T', 'Welcome', '', 'Order today']) },
  { name: 'P2 H3', html: '<!doctype html><title>T</title><span>Intro</span><body><h2>Sale</h2>Order today', edit: full(['T', 'Intro', '', 'Order today']) },
  { name: 'P2 H4', html: '<!doctype html><html><head><title>T</title></head>Welcome<body><h2>Sale</h2>Order today</body></html>', edit: full(['T', 'Welcome', '', 'Order today']) },
  { name: 'P2 H7 offer', html: '<!doctype html><html><head><title>T</title>Welcome</head><body>to <b>our</b> shop</body></html>', edit: (o: string[]) => o.map((l) => (l === 'to our shop' ? 'to our big shop' : l === 'Welcome to our shop' ? 'Welcome to our big shop' : l)) },
  // P3 foster adjacent glue
  { name: 'P3 F1 foster font', html: '<div>Lead<p>Middle</p><table><tr><font>F</font><td>Cell</td></tr></table></div>', edit: (o: string[]) => o.map((l) => (l === 'Middle' ? '' : l)) },
  { name: 'P3 F2 foster text', html: '<div>Lead<p>Middle</p><table><tr>Late<td>Cell</td></tr></table></div>', edit: (o: string[]) => o.map((l) => (l === 'Middle' ? '' : l)) },
  { name: 'P3 F3 foster b', html: '<div><b>Lead</b><h3>Middle</h3><table><tr><b>Bold</b><td>Cell</td></tr></table></div>', edit: (o: string[]) => o.map((l) => (l === 'Middle' ? '' : l)) },
  // P4 raw text inside an emptied inline element
  { name: 'P4 script in span', html: '<p>Hello <span>world<script>window.x=1</script></span></p>', edit: all(['Hello']) },
  { name: 'P4 noscript in b', html: '<p>Hello <b>world<noscript>Enable JS</noscript></b></p>', edit: all(['Hello']) },
  { name: 'P4 comment in span', html: '<p>Hello <span>world<!-- keep --></span></p>', edit: all(['Hello']) },
  { name: 'P4 template in b', html: '<p>Hello <b>world<template><p>T</p></template></b></p>', edit: all(['Hello']) },
  // P5 icon gap at a line edge
  { name: 'P5 svg + b lead prepend', html: '<p><svg width="9" height="9"></svg><b> Hello</b> world</p>', edit: all(['Big Hello world']) },
  { name: 'P5 append before svg', html: '<p>Hello <b>world </b><svg width="9" height="9"></svg></p>', edit: all(['Hello world now']) },
  // P6 foreign content
  { name: 'P6 M1 math title breakout', html: '<p><math><title><b>Text</b></title></math><span> b </span><font>C</font></p>', edit: (o: string[]) => o.map((l) => (l === 'b' ? '' : l)) },
  { name: 'P6 S1 svg title open over </p>', html: '<p>X<svg width="9" height="9"><title>Tip</p><p>Hello</p>', edit: (o: string[]) => o.map((l) => (l === 'Hello' ? 'Hello there' : l)) },
  // P7 gapKept for a hidden block
  { name: 'P7 hidden blockquote deleted between glued', html: '<p>bread: sale<blockquote hidden>Gone</blockquote>Spring!</p>', edit: (o: string[]) => o.map((l) => (l === 'Gone' ? '' : l)) },
  // P9 lone surrogate
  { name: 'P9 lone surrogate', html: '<p>Hello world</p>', edit: all(['Hello \ud800 world']) },
];
