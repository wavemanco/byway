// Extracts the owner's typed messages and question answers from a Claude Code session transcript, after the end of
// docs/adr/evidence/conversation.md, in docs/adr/evidence/conversation-continued.md's form (AGENTS.md, "The conversation
// record"). Times are written in UTC-7, the record's local time while the owner was on Pacific daylight time.
// shortcut: the offset is fixed at UTC-7; change it when the owner's local offset changes (UTC-8 after 2026-11-01).
//   node scripts/extract-conversation.cjs <transcript.jsonl> <out.md>
const fs=require('fs');
const [,, src, out] = process.argv;
const lines=fs.readFileSync(src,'utf8').split('\n').filter(Boolean);
const CUT='2026-10-07T17:57:32.474Z';
const recs=[]; for(const l of lines){ try{recs.push(JSON.parse(l))}catch(e){} }
const asks=new Map();
for(const o of recs) if(o.type==='assistant'&&Array.isArray(o.message?.content)) for(const p of o.message.content) if(p.type==='tool_use'&&p.name==='AskUserQuestion') asks.set(p.id,{ts:o.timestamp,input:p.input,side:!!o.isSidechain});
const entries=[]; const seen=new Set();
function local(ts){ const d=new Date(Date.parse(ts)-7*3600e3); const s=d.toISOString(); return s.slice(0,23)+'-07:00'; }
function add(ts,kind,text){ const key=kind+'|'+text.trim(); if(kind==='USER'&&seen.has(key)) return; seen.add(key); entries.push({ts,kind,text}); }
for(const o of recs){
  if(!o.timestamp||o.timestamp<=CUT) continue;
  if(o.isSidechain) continue;
  if(o.type==='user'){
    const c=o.message?.content;
    if(o.isCompactSummary||o.isMeta) continue;
    if(typeof c==='string'||(Array.isArray(c)&&c.every(p=>p.type==='text'))){
      const t=typeof c==='string'?c:c.map(p=>p.text).join('\n');
      const kind=o.origin?.kind;
      if(kind==='human') add(o.timestamp,'USER',t);
      else if(kind===undefined && /<command-name>\/goal<\/command-name>/.test(t)){
        const args=(t.match(/<command-args>([\s\S]*?)<\/command-args>/)||[])[1]||'';
        add(o.timestamp,'USER','/goal '+args);
      } else if(kind===undefined) { console.error('UNCLASSIFIED', o.timestamp, t.slice(0,120)); }
      continue;
    }
    if(Array.isArray(c)) for(const p of c) if(p.type==='tool_result'&&asks.has(p.tool_use_id)){
      const a=asks.get(p.tool_use_id); if(a.ts<=CUT) continue;
      const txt=typeof p.content==='string'?p.content:p.content.map(x=>x.text||'').join('');
      entries.push({ts:a.ts,kind:'CLAUDE-ASKS',text:JSON.stringify(a.input.questions)});
      entries.push({ts:o.timestamp,kind:'ANSWER',text:'[ANSWER] '+txt});
    }
  }
  if(o.type==='attachment'&&o.attachment?.type==='queued_command'&&o.attachment.origin?.kind==='human'){
    const p=o.attachment.prompt; const t=typeof p==='string'?p:p.map(x=>x.text||'').join('\n');
    add(o.attachment.timestamp||o.timestamp,'USER',t);
  }
}
entries.sort((a,b)=>a.ts<b.ts?-1:a.ts>b.ts?1:0);
let md='';
for(const e of entries){
  const head=e.kind==='ANSWER'?'USER':e.kind;
  md+=`---\n## ${head} ${local(e.ts)} (${e.ts})\n${e.text.replace(/\s+$/,'')}\n\n`;
}
fs.writeFileSync(out,md);
console.error('entries',entries.length, 'users',entries.filter(e=>e.kind==='USER').length,'asks',entries.filter(e=>e.kind==='CLAUDE-ASKS').length);
