# The Route Map drawn by hand (to 2026-10-23)

`2026-10-23-hand-built-map-v4.json` is the data of the byway Route Map (a claude.ai artifact outside the repository) as it
was last published by hand, version 4 on 2026-10-23: the 323 items Claude's agents drew from docs/backlog.md and
docs/playbook.md on 2026-10-18, 2026-10-22 and 2026-10-23, with the fields judged for each (milestones, land now and why,
size, kind, priority, owner needed, trigger type, waits on and unlocks, status at main 65825f4), the hand-drawn routes,
land-now batches, decision queue and waiting triggers, the gaps and audit views, and the trace of the external review at
main 8401820 (2026-10-18).

From the backlog sync of 2026-10-23 the map is generated from docs/backlog.md and docs/playbook.md by
`scripts/route-map.ts` and holds nothing of its own (docs/backlog.md, "How this file is kept"). The owner asked for that on
2026-10-23: "nothing in this artifact should be "artifact only" . everything has to flow from backlog file in Git". This
file keeps what only the hand-drawn map held, so that nothing of it is lost; the backlog's rows, not this file, are what is
pending.
