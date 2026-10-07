# Opus 5.5 worker: $4 in / $20 out / $5 cache write / $0.20 cache read ; Fable 5.1: $10/$50/$12.5/$0.25
def opus(uncached_in, cache_write, cache_read, out): return (uncached_in*4 + cache_write*5 + cache_read*0.20 + out*20)/1e6
def fable(inp, out): return (inp*10 + out*50)/1e6
build   = opus(60e3, 150e3, 1.2e6, 30e3)     # fresh agent session building a page
fix     = opus(20e3, 60e3, 600e3, 15e3)      # one fix turn-set after a critique
critic  = fable(6e3, 3e3)                    # 3 screenshots (~4.8k visual tokens) + prompt; ~3k out incl. thinking
rerank  = fable(15e3, 3e3)                   # top-3 snapshots, 3 images each
selfit  = fix + opus(5e3, 0, 0, 2e3)         # self-review iteration (worker sees own screenshots)
img     = 0.101                              # Gemini 3.1 Flash Image, 2K
asset   = opus(20e3, 60e3, 700e3, 20e3) + 4*img
d3      = 4*fable(8e3, 2.5e3) + 2*fix        # taste-owner itemization + TELLS A/B picks + 2 worker rounds
loop    = 4*critic + 3.5*fix + rerank        # avg 4 critic calls, 3.5 fixes (cap 5)
skill_build = build + opus(0, 4e3, 4e3*20, 0) # SKILL.md (~3.5k tokens) cached across turns
arms = {
 "C1-full":     build + loop + asset + d3,
 "-D3":         0.0,                              # snapshot of C1 before D3
 "-ASSET":      d3,                               # branch from post-critic snapshot
 "-CRITIC":     asset + d3,                       # branch from seeded build
 "CRITIC-self": 4*selfit + asset + d3,            # branch from seeded build
 "-SEED":       loop + asset + d3,                # root shared with B-Plain
 "B-Plain":     build,
 "B-Random":    build,
 "B-Skill":     skill_build,
}
print("unit costs: build %.2f fix %.2f critic %.2f rerank %.2f asset %.2f d3 %.2f loop %.2f" % (build, fix, critic, rerank, asset, d3, loop))
per_cand = sum(arms.values())
for k,v in arms.items(): print(f"  {k:12s} ${v:6.2f} per candidate  -> ${4*v:7.2f} per brief")
pb = 4*per_cand; print(f"per brief (K=4): ${pb:.0f}; with 25% contingency ${pb*1.25:.0f}")
for B in [48, 60]: print(f"  {B} briefs: ${pb*1.25*B:,.0f}")
print(f"pilot 12 briefs full: ${pb*1.25*12:,.0f}; pilot 12 briefs 3 arms (C1,B-Plain,B-Skill): ${12*4*1.25*(arms['C1-full']+arms['B-Plain']+arms['B-Skill']):,.0f}")
# GPT worker generalization arm: C1-full + B-Plain on 24 briefs (GPT-5.6 Sol same $4/$20 list price; assume similar tokens)
print(f"GPT-worker arm 24 briefs: ${24*4*1.25*(arms['C1-full']+arms['B-Plain']):,.0f}")
# AI judges
pairs = 12*48*8*2
sol = (10e3*4 + 1.5e3*20)/1e6; gem = (10e3*2 + 1.5e3*12)/1e6
print(f"AI judge calls per judge {pairs}; GPT-5.6 Sol ${pairs*sol:,.0f}; Gemini 3.1 Pro ${pairs*gem:,.0f}; total ${pairs*(sol+gem):,.0f} (batch ~${pairs*(sol+gem)/2:,.0f})")
# lay raters
prim = 12*48*24; tot = prim*1.20; sessions = tot/30
pay = sessions*4.50
print(f"lay judgments primary {prim}, total {tot:.0f}, sessions {sessions:.0f}, rewards ${pay:,.0f}, +33.3% ${pay*1.333:,.0f}, +42.8% ${pay*1.428:,.0f}")
exp_j = 7*48*6; print(f"expert judgments {exp_j}; 20 experts x 2.5h x $90 = ${20*2.5*90:,.0f}")
