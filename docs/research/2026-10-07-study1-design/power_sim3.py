#!/usr/bin/env python
"""
power_sim3.py -- byway Paper 1 / Study 1: Monte Carlo power and test-choice simulation.
Successor to docs/research/2026-10-06-harness-research/power_sim2.py (2026-10-07).

PURPOSE
  1) Choose the primary confirmatory test for each pairwise contrast: brief-level (cluster)
     one-sample t-test on per-brief win proportions vs model-based alternatives that run in
     plain numpy/scipy (statsmodels is NOT installed; nothing was installed):
       - cluster t      : one-sample t on per-brief win proportions vs .50, df = B-1   (draft primary)
       - sign-flip      : randomization test on per-brief (p_b - .5), 2,000 random sign flips
       - GEE-z          : logit GEE, exchangeable working corr., clustered by brief, sandwich SE, normal ref.
                          (what statsmodels' GEE would report by default)
       - GEE-MD-t       : same, Mancl-DeRouen bias-corrected sandwich, t(B-1) reference
       - 2way-CR t      : linear-probability mean with two-way (brief x rater) cluster-robust variance
                          (Cameron-Gelbach-Miller), t(min(B,R)-1) reference
       - GLMM-crossed   : mixed logistic, crossed random intercepts for brief, candidate(s) and rater,
                          Laplace approximation (joint PIRLS mode over fixed + random effects, as lme4
                          nAGQ=0), Wald z.  Hand-written below; validated by --selfcheck.
  2) Size the study: briefs B in {48,60,72} x lay judgments per brief-contrast J in {16,24,32} x true
     win rate in {.55,.58,.60,.62}; gate H1a at alpha .05 (charter CR4), Holm worst case alpha/m for the
     rest; TOST equivalence power at margins +-.08/.06/.05 when the true effect is 0.
  3) Expert panel: 8 judgments per brief-contrast with a panel of 12 vs 20 experts.

DATA-GENERATING PROCESS (one contrast "A vs X", logit scale; ASSUMPTIONS until the pilot replaces them)
  P(rater prefers A) = expit( delta_b + qA[b,ia] - qX[b,ix] + u_r )
    delta_b ~ N(delta, tau_b^2)            brief x arm heterogeneity (brief main effects cancel in a pair)
    qA, qX  ~ N(0, sig_c^2)                candidate quality within arm, K = 4 candidates per arm per brief
                                           matched ablations: corr(qA_k, qX_k) = rho (shared seed lineage),
                                           and only same-lineage pairs (k,k) are judged
    u_r     ~ N(0, sig_r^2)                rater taste for arm A on this contrast (rater x arm slope);
                                           raters are a FINITE pool shared across briefs:
                                           lay: each rater gives m judgments per contrast, all different briefs
                                           expert: a panel of R experts; each brief gets J distinct experts
  delta is calibrated so the MARGINAL win rate (averaged over briefs, candidates, raters) equals the
  target ("true win rate").  Candidate pairings are BALANCED within brief (each candidate shown J/K times;
  unmatched contrasts cycle through the K x K pairings) -- the Judge scheduler should do the same.
  Position (left/right) is randomized in the study; position bias is not simulated (it only adds noise).

DEFAULT ASSUMPTIONS (study1-draft.md): tau_b=0.5, sig_c=0.8, sig_r=0.5 (lay), rho=0.6, K=4,
  expert sig_r=0.3; lay m=3 judgments per rater per contrast (30-pair sessions spread over ~8 quality
  contrasts after golds/connectivity pairs).  The Integrity Monitor's pilot release (CR4) replaces them:
      python power_sim3.py --tau-b 0.6 --sig-c 0.9 --sig-r 0.4 --rho 0.5 --m 3
USAGE
      python power_sim3.py               full run (about 10-20 min on 16 cores)
      python power_sim3.py --quick       smoke test
      python power_sim3.py --selfcheck   verify the GEE closed form and the GLMM fitter
Outputs markdown tables on stdout and all numbers in power_sim3_results.json next to this file.
"""
import os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")
import argparse, json, math, sys, time
import numpy as np
from scipy import stats, optimize, special, linalg
from concurrent.futures import ProcessPoolExecutor

expit, logit = special.expit, special.logit
BASE = dict(tau_b=0.5, sig_c=0.8, sig_r=0.5, rho=0.6, K=4, m=3, sig_r_expert=0.3, brief_dist="normal")
_GHX, _GHW = np.polynomial.hermite_e.hermegauss(101)
_GHW = _GHW / _GHW.sum()
NFLIP = 2000


# ----------------------------------------------------------------------------- data generation
def total_sd(P, matched, sig_r):
    rho = P["rho"] if matched else 0.0
    return math.sqrt(P["tau_b"] ** 2 + 2 * P["sig_c"] ** 2 * (1 - rho) + sig_r ** 2)


def calibrate(win, s):
    """delta such that E[expit(delta + s Z)] = win (Gauss-Hermite, exact for the normal DGP)."""
    if abs(win - 0.5) < 1e-12:
        return 0.0
    return optimize.brentq(lambda d: float(np.sum(_GHW * expit(d + s * _GHX))) - win, -8, 8, xtol=1e-12)


def pairing(J, K, matched):
    j = np.arange(J)
    ia = j % K
    ix = ia.copy() if matched else (ia + (j // K)) % K
    return ia, ix


def rater_ids(rng, n, B, J, mode, val):
    if mode == "lay":
        m = val
        if m == 1:
            return np.broadcast_to(np.arange(B * J).reshape(B, J), (n, B, J)), B * J
        if B % m:
            raise ValueError("B must be divisible by m")
        perm = np.argsort(rng.random((n, J, B)), axis=2)       # brief order within each 'round'
        inv = np.argsort(perm, axis=2)
        pos = np.arange(J)[None, :, None] * B + inv
        return (pos // m).transpose(0, 2, 1), B * J // m      # m consecutive slots -> m distinct briefs
    R = val                                                     # expert panel
    if J > R:
        raise ValueError("J > panel size")
    rid = (np.arange(B)[:, None] * J + np.arange(J)[None, :]) % R   # balanced load, J distinct experts/brief
    return np.broadcast_to(rid, (n, B, J)), R


def gen(rng, n, B, J, win, P, matched, mode, val, sig_r):
    K, sc = P["K"], P["sig_c"]
    delta = calibrate(win, total_sd(P, matched, sig_r))
    if P.get("brief_dist", "normal") == "t3":                   # heavy-tailed brief effects, same SD
        z = rng.standard_t(3, (n, B)) / math.sqrt(3.0)
    else:
        z = rng.standard_normal((n, B))
    db = delta + P["tau_b"] * z
    if matched:
        rho = P["rho"]
        sh = rng.standard_normal((n, B, K)) * sc * math.sqrt(rho)
        qa = sh + rng.standard_normal((n, B, K)) * sc * math.sqrt(1 - rho)
        qx = sh + rng.standard_normal((n, B, K)) * sc * math.sqrt(1 - rho)
    else:
        qa = rng.standard_normal((n, B, K)) * sc
        qx = rng.standard_normal((n, B, K)) * sc
    ia, ix = pairing(J, K, matched)
    rid, R = rater_ids(rng, n, B, J, mode, val)
    rid = np.ascontiguousarray(rid)
    u = rng.standard_normal((n, R)) * sig_r
    ur = np.take_along_axis(u, rid.reshape(n, -1), axis=1).reshape(n, B, J)
    eta = db[:, :, None] + qa[:, :, ia] - qx[:, :, ix] + ur
    y = (rng.random((n, B, J)) < expit(eta)).astype(np.int8)
    return y, rid, R


# ----------------------------------------------------------------------------- cheap tests
def cheap_tests(y, rid, R, flips=None):
    """Return dict test -> (direction statistic, two-sided p) for every replicate, plus mbar/se."""
    n, B, J = y.shape
    N = B * J
    p = y.mean(axis=2)
    d = p - 0.5
    mbar = d.mean(1)
    se = d.std(1, ddof=1) / math.sqrt(B)
    t = np.divide(mbar, se, out=np.zeros_like(mbar), where=se > 0)
    out = {"cluster t": (mbar, 2 * stats.t.sf(np.abs(t), B - 1))}
    # GEE (logit link, exchangeable working correlation, clustered by brief). With equal cluster sizes
    # and an intercept-only model the estimating equation gives beta = logit(ybar) for any working
    # correlation, and the sandwich reduces to sum_b (sum_j r_bj)^2 / (N mu (1-mu))^2 (selfcheck verifies).
    ybar = np.clip(p.mean(1), 1e-9, 1 - 1e-9)
    beta = logit(ybar)
    rs = J * (p - ybar[:, None])
    V = (rs ** 2).sum(1) / (N * ybar * (1 - ybar)) ** 2
    z = np.divide(beta, np.sqrt(V), out=np.zeros_like(beta), where=V > 0)
    out["GEE-z"] = (beta, 2 * stats.norm.sf(np.abs(z)))
    out["GEE-MD-t"] = (beta, 2 * stats.t.sf(np.abs(z) * (B - 1) / B, B - 1))   # Mancl-DeRouen: V*(B/(B-1))^2
    # two-way cluster-robust (brief, rater) on the linear-probability scale
    e = y - ybar[:, None, None]
    VB = B / (B - 1) * (rs ** 2).sum(1) / N ** 2
    ids = (rid.reshape(n, -1) + (np.arange(n) * R)[:, None]).ravel()
    er = np.bincount(ids, weights=e.reshape(n, -1).ravel(), minlength=n * R).reshape(n, R)
    VR = R / (R - 1) * (er ** 2).sum(1) / N ** 2
    V0 = (e ** 2).sum((1, 2)) / N ** 2
    V2 = VB + VR - V0
    V2 = np.where(V2 > 0, V2, VB)
    t2 = (ybar - 0.5) / np.sqrt(V2)
    out["2way-CR t"] = (ybar - 0.5, 2 * stats.t.sf(np.abs(t2), min(B, R) - 1))
    if flips is not None:
        Tp = d @ flips.T / B
        pf = (1 + (np.abs(Tp) >= np.abs(mbar)[:, None] - 1e-12).sum(1)) / (flips.shape[0] + 1)
        out["sign-flip"] = (mbar, pf)
    return out, mbar, se


# ----------------------------------------------------------------------------- crossed GLMM (Laplace)
def glmm_fit(y, rid, R, ia, ix, matched, K, th0=(-0.7, -0.2, -0.7), bounds=(-4.0, 1.5)):
    """Mixed logistic: win ~ 1 + (1|brief) + (1|cand_A) + (1|cand_X) + (1|rater)   [unmatched]
                       win ~ 1 + (1|brief) + (1|lineage pair) + (1|rater)          [matched]
    One SD for brief, one shared SD for candidate effects, one for raters.  Laplace approximation,
    beta estimated jointly with the random effects in PIRLS (lme4 nAGQ=0 style), Wald z on beta.
    Brief-nested effects are eliminated blockwise (B blocks of size L), then a dense Schur complement
    over raters + beta (size R+1)."""
    B, J = y.shape
    L = 1 + (K if matched else 2 * K)
    X = np.zeros((B, J, L))
    X[:, :, 0] = 1.0
    jj = np.arange(J)
    X[:, jj, 1 + ia] = 1.0
    if not matched:
        X[:, jj, 1 + K + ix] = -1.0
    yf = y.astype(float)
    bb = np.repeat(np.arange(B)[:, None], J, 1)
    rflat = rid.ravel()
    G = R + 1
    diagL = np.arange(L)
    st = {"uL": np.zeros((B, L)), "uR": np.zeros(R), "beta": 0.0}

    def plik(uL, uR, beta, precL, precR):
        eta = beta + np.einsum("bjl,bl->bj", X, uL) + uR[rid]
        ll = np.sum(yf * eta - np.logaddexp(0.0, eta))
        return ll - 0.5 * np.sum(precL * uL ** 2) - 0.5 * precR * np.sum(uR ** 2), eta

    def newton(th):
        sb, sc, sr = np.exp(th)
        precL = np.r_[1 / sb ** 2, np.full(L - 1, 1 / sc ** 2)]
        precR = 1 / sr ** 2
        uL, uR, beta = st["uL"].copy(), st["uR"].copy(), st["beta"]
        pl, eta = plik(uL, uR, beta, precL, precR)
        for it in range(80):
            mu = expit(eta)
            w = mu * (1 - mu)
            res = yf - mu
            gL = np.einsum("bjl,bj->bl", X, res) - precL * uL
            gR = np.bincount(rflat, res.ravel(), R) - precR * uR
            gB = res.sum()
            A = np.einsum("bjl,bj,bjm->blm", X, w, X)
            A[:, diagL, diagL] += precL
            Ct = np.zeros((B, G, L))
            np.add.at(Ct, (bb, rid), w[..., None] * X)
            Ct[:, R, :] = np.einsum("bjl,bj->bl", X, w)
            wr = np.bincount(rflat, w.ravel(), R)
            D = np.zeros((G, G))
            D[np.arange(R), np.arange(R)] = wr + precR
            D[:R, R] = wr
            D[R, :R] = wr
            D[R, R] = w.sum()
            Ainv = np.linalg.inv(A)
            AinvCt = np.einsum("blm,bgm->bgl", Ainv, Ct)
            S = D - Ct.transpose(1, 0, 2).reshape(G, B * L) @ AinvCt.transpose(1, 0, 2).reshape(G, B * L).T
            S = 0.5 * (S + S.T)
            Lc = np.linalg.cholesky(S)
            rhs = np.r_[gR, gB] - np.einsum("bgl,bl->g", AinvCt, gL)
            dG = linalg.cho_solve((Lc, True), rhs)
            dL = np.einsum("blm,bm->bl", Ainv, gL - np.einsum("bgl,g->bl", Ct, dG))
            stepmax = max(np.abs(dL).max(), np.abs(dG).max())
            if stepmax < 1e-9:
                break
            step = 1.0
            while True:
                nuL, nuR, nb = uL + step * dL, uR + step * dG[:R], beta + step * dG[R]
                npl, neta = plik(nuL, nuR, nb, precL, precR)
                if npl >= pl - 1e-12 or step < 1e-6:
                    break
                step *= 0.5
            uL, uR, beta, pl, eta = nuL, nuR, nb, npl, neta
        _, ldA = np.linalg.slogdet(A)
        logdet = ldA.sum() + 2 * np.log(np.diag(Lc)[:R]).sum()
        lap = pl - (B * np.log(sb) + B * (L - 1) * np.log(sc) + R * np.log(sr)) - 0.5 * logdet
        st.update(uL=uL, uR=uR, beta=beta)
        return lap, beta, 1.0 / Lc[R, R] ** 2

    def obj(th):
        try:
            return -newton(th)[0]
        except np.linalg.LinAlgError:
            return 1e12

    res = optimize.minimize(obj, np.array(th0, float), method="L-BFGS-B",
                            bounds=[bounds] * 3, options=dict(eps=1e-4, maxiter=300))
    lap, beta, varb = newton(res.x)
    return beta, math.sqrt(varb), bool(res.success), np.exp(res.x)


# ----------------------------------------------------------------------------- workers
def cheap_cell(task):
    """Monte Carlo cell with the cheap tests. Returns per-test rejection rates and equivalence rates."""
    (seed, nrep, B, J, win, P, matched, mode, val, sig_r, alphas, margins, eq_alphas, with_flip) = task
    rng = np.random.default_rng(seed)
    flips = rng.choice(np.array([-1.0, 1.0]), size=(NFLIP, B)) if with_flip else None
    acc, chunk, done = {}, 500, 0
    eq = {}
    ni = 0
    sdp = []
    while done < nrep:
        n = min(chunk, nrep - done)
        y, rid, R = gen(rng, n, B, J, win, P, matched, mode, val, sig_r)
        res, mbar, se = cheap_tests(y, rid, R, flips)
        for name, (est, pv) in res.items():
            a = acc.setdefault(name, {})
            for al in alphas:
                a.setdefault(f"pos{al}", 0)
                a.setdefault(f"two{al}", 0)
                a[f"pos{al}"] += int(np.sum((est > 0) & (pv < al)))
                a[f"two{al}"] += int(np.sum(pv < al))
        for M in margins:
            for ae in eq_alphas:
                tc = stats.t.ppf(1 - ae, B - 1)
                k = f"M{M}_a{ae}"
                eq[k] = eq.get(k, 0) + int(np.sum((mbar - tc * se > -M) & (mbar + tc * se < M)))
        ni += int(np.sum(mbar - stats.t.ppf(0.975, B - 1) * se > -0.08))
        sdp.append(se * math.sqrt(B))
        done += n
    out = {name: {k: v / nrep for k, v in a.items()} for name, a in acc.items()}
    return dict(tests=out, eq={k: v / nrep for k, v in eq.items()}, ni08=ni / nrep,
                sd_pb=float(np.mean(np.concatenate(sdp))))


def glmm_chunk(task):
    (seed, nrep, B, J, win, P, matched, mode, val, sig_r) = task
    rng = np.random.default_rng(seed)
    y, rid, R = gen(rng, nrep, B, J, win, P, matched, mode, val, sig_r)
    ia, ix = pairing(J, P["K"], matched)
    res, mbar, se = cheap_tests(y, rid, R, None)
    rows = []
    for i in range(nrep):
        try:
            b, s, ok, th = glmm_fit(y[i], rid[i], R, ia, ix, matched, P["K"])
            rows.append((b, s, ok, *th))
        except Exception:
            rows.append((np.nan, np.nan, False, np.nan, np.nan, np.nan))
    return dict(glmm=rows, cheap={k: (v[0].tolist(), v[1].tolist()) for k, v in res.items()})


# ----------------------------------------------------------------------------- helpers
def seeds(n, root=20261007):
    return [int(s.generate_state(1)[0]) for s in np.random.SeedSequence(root).spawn(n)]


def fmt(x):
    return f"{x:.2f}" if x < 0.995 else ">.99"


def fmt3(x):
    return f"{x:.3f}"


# ----------------------------------------------------------------------------- self-check
def selfcheck():
    rng = np.random.default_rng(1)
    P = dict(BASE)
    # 1) GEE closed form vs a generic iterative exchangeable GEE (loops, no shortcuts)
    y, rid, R = gen(rng, 1, 24, 16, 0.6, P, False, "lay", 3, P["sig_r"])
    Y = y[0].astype(float)
    B, J = Y.shape
    beta, alpha = 0.0, 0.0
    for _ in range(50):
        mu = expit(beta)
        r = (Y - mu) / math.sqrt(mu * (1 - mu))
        num = sum((r[b].sum() ** 2 - (r[b] ** 2).sum()) for b in range(B))
        alpha = num / (B * J * (J - 1)) / ((r ** 2).sum() / (B * J))
        Rm = (1 - alpha) * np.eye(J) + alpha
        Vi = np.linalg.inv(mu * (1 - mu) * Rm)
        Dv = mu * (1 - mu) * np.ones(J)
        bread = sum(Dv @ Vi @ Dv for _ in range(B))
        score = sum(Dv @ Vi @ (Y[b] - mu) for b in range(B))
        beta += score / bread
    meat = sum((Dv @ Vi @ (Y[b] - mu)) ** 2 for b in range(B))
    se_generic = math.sqrt(meat) / bread
    res, _, _ = cheap_tests(y, rid, R)
    z_closed = stats.norm.isf(res["GEE-z"][1][0] / 2)
    print(f"[selfcheck] GEE generic beta={beta:.6f} (alpha={alpha:.3f}) closed beta={res['GEE-z'][0][0]:.6f}; "
          f"|z| generic={abs(beta) / se_generic:.5f} closed={z_closed:.5f}")
    # 2) GLMM recovers variance components on a big dataset (single replicate, 120 briefs x 64 judgments)
    for matched in (False, True):
        y, rid, R = gen(rng, 1, 120, 64, 0.62, P, matched, "lay", 4, P["sig_r"])
        ia, ix = pairing(64, P["K"], matched)
        t0 = time.time()
        b, s, ok, th = glmm_fit(y[0], rid[0], R, ia, ix, matched, P["K"])
        cs = P["sig_c"] * math.sqrt(2 * (1 - P["rho"])) if matched else P["sig_c"]
        print(f"[selfcheck] GLMM matched={matched}: beta={b:.3f} se={s:.3f} ok={ok} "
              f"sd(brief,cand,rater)={np.round(th, 3)} (truth {P['tau_b']}, {cs:.3f}, {P['sig_r']}); "
              f"conditional delta truth={calibrate(0.62, total_sd(P, matched, P['sig_r'])):.3f}; {time.time() - t0:.1f}s")
    # timing at the design point
    y, rid, R = gen(rng, 1, 48, 24, 0.5, P, False, "lay", 3, P["sig_r"])
    ia, ix = pairing(24, 4, False)
    t0 = time.time()
    glmm_fit(y[0], rid[0], R, ia, ix, False, 4)
    print(f"[selfcheck] GLMM fit time at B=48,J=24,R={R}: {time.time() - t0:.2f}s")


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tau-b", type=float, default=BASE["tau_b"])
    ap.add_argument("--sig-c", type=float, default=BASE["sig_c"])
    ap.add_argument("--sig-r", type=float, default=BASE["sig_r"])
    ap.add_argument("--sig-r-expert", type=float, default=BASE["sig_r_expert"])
    ap.add_argument("--rho", type=float, default=BASE["rho"])
    ap.add_argument("--m", type=int, default=BASE["m"])
    ap.add_argument("--reps", type=int, default=4000)
    ap.add_argument("--glmm-reps", type=int, default=480)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--selfcheck", action="store_true")
    ap.add_argument("--no-glmm", action="store_true")
    a = ap.parse_args()
    if a.selfcheck:
        selfcheck()
        return
    P = dict(BASE, tau_b=a.tau_b, sig_c=a.sig_c, sig_r=a.sig_r, rho=a.rho, m=a.m, sig_r_expert=a.sig_r_expert)
    reps, greps = (400, 48) if a.quick else (a.reps, a.glmm_reps)
    Bs, Js, wins = [48, 60, 72], [16, 24, 32], [0.55, 0.58, 0.60, 0.62]
    ALPHAS = [0.05, 0.025, 0.0167, 0.0125, 0.01]
    MARG, EQA = [0.08, 0.06, 0.05], [0.05, 0.0125]
    T0 = time.time()
    results = dict(assumptions=P, reps=reps, glmm_reps=greps)
    tasks, keys = [], []

    def add(key, B, J, win, PP, matched, mode, val, sig_r, flip=False):
        keys.append(key)
        tasks.append([None, reps, B, J, win, PP, matched, mode, val, sig_r, ALPHAS, MARG, EQA, flip])

    # --- (2) main grid: lay, cluster t (and the other cheap tests on the same draws)
    for B in Bs:
        for J in Js:
            for matched in (False, True):
                for win in [0.5] + wins:
                    add(("grid", B, J, matched, win), B, J, win, P, matched, "lay", P["m"], P["sig_r"])
    # --- (1) test comparison anchor B=48,J=24 with sign-flip, plus stress scenarios (type I)
    stress = {
        "base m=3": dict(P),
        "independent raters m=1": dict(P, m=1),
        "m=6 (distinctiveness pool)": dict(P, m=6),
        "big components tau.8 sc1.2 sr.8 m=6": dict(P, tau_b=0.8, sig_c=1.2, sig_r=0.8, m=6),
        "heavy-tailed briefs t3": dict(P, brief_dist="t3"),
    }
    for sname, PP in stress.items():
        for matched in (False, True):
            for win in ([0.5, 0.58, 0.60] if sname == "base m=3" else [0.5]):
                add(("cmp", sname, matched, win), 48, 24, win, PP, matched, "lay", PP["m"], PP["sig_r"], flip=True)
    # --- (3) expert panel J=8
    for R in (12, 20):
        for sr in (P["sig_r_expert"], 0.5):
            for matched in (False, True):
                for B in Bs:
                    for win in [0.5, 0.58, 0.60, 0.62, 0.65]:
                        if B != 48 and sr != P["sig_r_expert"]:
                            continue
                        add(("exp", R, sr, matched, B, win), B, 8, win, P, matched, "expert", R, sr)
    # --- sensitivity of the brief count to variance components (J=24)
    sens = {
        "assumed (tau.5 sc.8 sr.5 rho.6)": dict(P),
        "tau_b .8": dict(P, tau_b=0.8),
        "sig_c 1.2": dict(P, sig_c=1.2),
        "tau_b .8 + sig_c 1.2": dict(P, tau_b=0.8, sig_c=1.2),
        "optimistic tau .3 sc .6": dict(P, tau_b=0.3, sig_c=0.6),
        "sig_r .8, m=6": dict(P, sig_r=0.8, m=6),
        "rho .4": dict(P, rho=0.4),
    }
    for sname, PP in sens.items():
        for B in Bs:
            add(("sens", sname, B, False, 0.60), B, 24, 0.60, PP, False, "lay", PP["m"], PP["sig_r"])
            add(("sens", sname, B, True, 0.58), B, 24, 0.58, PP, True, "lay", PP["m"], PP["sig_r"])
    for t, s in zip(tasks, seeds(len(tasks))):
        t[0] = s
    gl_specs = []
    if not a.no_glmm:
        gl_specs = [
            ("lay U null", 48, 24, 0.5, P, False, "lay", P["m"], P["sig_r"]),
            ("lay U .60", 48, 24, 0.60, P, False, "lay", P["m"], P["sig_r"]),
            ("lay M null", 48, 24, 0.5, P, True, "lay", P["m"], P["sig_r"]),
            ("lay M .58", 48, 24, 0.58, P, True, "lay", P["m"], P["sig_r"]),
            ("exp12 U null", 48, 8, 0.5, P, False, "expert", 12, P["sig_r_expert"]),
            ("exp12 U .62", 48, 8, 0.62, P, False, "expert", 12, P["sig_r_expert"]),
            ("exp20 U null", 48, 8, 0.5, P, False, "expert", 20, P["sig_r_expert"]),
            ("exp20 U .62", 48, 8, 0.62, P, False, "expert", 20, P["sig_r_expert"]),
            ("exp12 M null", 48, 8, 0.5, P, True, "expert", 12, P["sig_r_expert"]),
            ("exp20 M null", 48, 8, 0.5, P, True, "expert", 20, P["sig_r_expert"]),
            ("exp12 U null sig_r .5", 48, 8, 0.5, P, False, "expert", 12, 0.5),
            ("lay U null big comps m=6", 48, 24, 0.5, dict(P, tau_b=0.8, sig_c=1.2, sig_r=0.8, m=6), False, "lay", 6, 0.8),
        ]
    gtasks, gkeys = [], []
    CH = 12
    for spec in gl_specs:
        nr = 2 * greps if "null" in spec[0] and "big" not in spec[0] else greps
        n_chunks = math.ceil(nr / CH)
        for c in range(n_chunks):
            gkeys.append(spec[0])
            gtasks.append([None, min(CH, nr - c * CH), *spec[1:]])
    for t, s in zip(gtasks, seeds(len(gtasks), root=777)):
        t[0] = s

    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        gfuts = [ex.submit(glmm_chunk, tuple(t)) for t in gtasks]       # long jobs first
        cres = list(ex.map(cheap_cell, [tuple(t) for t in tasks], chunksize=1))
        print(f"cheap cells done in {time.time() - T0:.0f}s", file=sys.stderr)
        gres = [f.result() for f in gfuts]
    print(f"all done in {time.time() - T0:.0f}s", file=sys.stderr)
    R_ = dict(zip(keys, cres))
    results["cells"] = {json.dumps(k): v for k, v in R_.items()}

    # ---- aggregate GLMM
    G = {}
    for k, r in zip(gkeys, gres):
        g = G.setdefault(k, {"glmm": [], "cheap": {}})
        g["glmm"].extend(r["glmm"])
        for name, (est, pv) in r["cheap"].items():
            e0, p0 = g["cheap"].setdefault(name, ([], []))
            e0.extend(est)
            p0.extend(pv)
    gsum = {}
    for k, g in G.items():
        arr = np.array(g["glmm"], dtype=float)
        b, s, ok = arr[:, 0], arr[:, 1], arr[:, 2] > 0
        valid = np.isfinite(b) & np.isfinite(s) & (s > 0)
        pz = np.where(valid, 2 * stats.norm.sf(np.abs(np.divide(b, s, out=np.zeros_like(b), where=valid))), 1.0)
        row = {"n": int(len(b)), "fail_or_warn": float(np.mean(~(valid & ok))),
               "sd_hat_median": np.nanmedian(arr[:, 3:6], axis=0).round(3).tolist(),
               "rater_sd_at_bound": float(np.mean(arr[:, 5] < 0.02))}
        for al in (0.05, 0.0125, 0.01):
            row[f"glmm_pos{al}"] = float(np.mean((b > 0) & (pz < al) & valid))
            row[f"glmm_two{al}"] = float(np.mean((pz < al) & valid))
            for name, (est, pv) in g["cheap"].items():
                est, pv = np.array(est), np.array(pv)
                row[f"{name}_pos{al}"] = float(np.mean((est > 0) & (pv < al)))
                row[f"{name}_two{al}"] = float(np.mean(pv < al))
        pt = np.array(g["cheap"]["cluster t"][1])
        row["agree_glmm_vs_t_at_.05"] = float(np.mean((pz < 0.05) == (pt < 0.05)))
        gsum[k] = row
    results["glmm"] = gsum

    # ------------------------------------------------------------------ print tables
    out = []
    pr = out.append
    pr(f"# power_sim3 results ({time.strftime('%Y-%m-%d %H:%M')}); reps/cell={reps}, GLMM reps/cell={greps}")
    pr(f"Assumptions: {json.dumps(P)}\n")

    pr("## T1. Test comparison, lay raters, B=48, J=24 (two-sided p; power counts only wins in the predicted direction)")
    pr("Type I = rejection rate at alpha .05 under a true win rate of .50. U = unmatched (all K x K pairings); M = matched lineage (rho .6).")
    names = ["cluster t", "sign-flip", "GEE-z", "GEE-MD-t", "2way-CR t"]
    hdr = "| test | typeI U (base m=3) | typeI M | typeI U m=1 | typeI U m=6 | typeI U big comps | typeI U t3 briefs | power U .60 a.05 | power U .60 a.0125 | power M .58 a.0125 |"
    pr(hdr)
    pr("|" + "---|" * (hdr.count("|") - 1))
    for nm in names:
        c = lambda s, mt, w: R_[("cmp", s, mt, w)]["tests"][nm]
        pr(f"| {nm} | {fmt3(c('base m=3', False, 0.5)['two0.05'])} | {fmt3(c('base m=3', True, 0.5)['two0.05'])} | "
           f"{fmt3(c('independent raters m=1', False, 0.5)['two0.05'])} | {fmt3(c('m=6 (distinctiveness pool)', False, 0.5)['two0.05'])} | "
           f"{fmt3(c('big components tau.8 sc1.2 sr.8 m=6', False, 0.5)['two0.05'])} | {fmt3(c('heavy-tailed briefs t3', False, 0.5)['two0.05'])} | "
           f"{fmt(c('base m=3', False, 0.6)['pos0.05'])} | {fmt(c('base m=3', False, 0.6)['pos0.0125'])} | {fmt(c('base m=3', True, 0.58)['pos0.0125'])} |")
    if gsum:
        pr("\n### T1b. Crossed GLMM (Laplace) vs the cheap tests on the SAME simulated datasets (B=48)")
        pr("| cell | n | GLMM rej .05 | cluster t rej .05 | 2way-CR rej .05 | GEE-z rej .05 | GLMM pos .0125 | cluster t pos .0125 | decision agreement GLMM vs t (.05) | GLMM fail/warn | median SD-hat (brief, cand, rater) |")
        pr("|---|---|---|---|---|---|---|---|---|---|---|")
        for k, r in gsum.items():
            kind = "pos" if ("null" not in k) else "two"
            pr(f"| {k} | {r['n']} | {fmt3(r[f'glmm_{kind}0.05'])} | {fmt3(r[f'cluster t_{kind}0.05'])} | {fmt3(r[f'2way-CR t_{kind}0.05'])} | "
               f"{fmt3(r[f'GEE-z_{kind}0.05'])} | {fmt3(r[f'glmm_{kind}0.0125'])} | {fmt3(r[f'cluster t_{kind}0.0125'])} | "
               f"{fmt3(r['agree_glmm_vs_t_at_.05'])} | {fmt3(r['fail_or_warn'])} | {r['sd_hat_median']} |")

    def gridtab(matched, alist, title):
        pr(f"\n## {title}")
        pr("Cluster t-test, lay raters (m=3 judgments per rater per contrast). Cell = power at alpha " + " / ".join(str(x) for x in alist) + ".")
        pr("| B | J | " + " | ".join(f"win {w:.2f}" for w in wins) + " | type I (a .05) | gen + lay cost (approx) |")
        pr("|---|---|" + "---|" * (len(wins) + 2))
        for B in Bs:
            for J in Js:
                cells = []
                for w in wins:
                    t = R_[("grid", B, J, matched, w)]["tests"]["cluster t"]
                    cells.append(" / ".join(fmt(t[f"pos{al}"]) for al in alist))
                t0 = R_[("grid", B, J, matched, 0.5)]["tests"]["cluster t"]["two0.05"]
                cost = B * 180 + 12 * B * J * 0.24
                pr(f"| {B} | {J} | " + " | ".join(cells) + f" | {fmt3(t0)} | ${cost / 1000:.1f}k |")

    gridtab(False, [0.05, 0.025, 0.0125], "T2. Unmatched contrasts (replication H1a-c, distinctiveness, -SEED): power")
    gridtab(True, [0.0125, 0.01], "T3. Matched-lineage ablations (H3a-d: -CRITIC, CRITIC-self, -ASSET, -D3): power")

    pr("\n## T4. Equivalence (TOST) power when the true win rate is exactly .50")
    pr("Cell = P(90% CI inside +-M) [alpha .05 per test] / P(97.5% CI inside +-M) [Holm worst case over 4 equivalence claims]. Cluster-level CI.")
    pr("| B | J | U +-.08 | U +-.06 | U +-.05 | M +-.08 | M +-.06 | M +-.05 | NI U (.42 bound) | sd(p_b) U | sd(p_b) M |")
    pr("|---|---|---|---|---|---|---|---|---|---|---|")
    for B in Bs:
        for J in Js:
            u, m = R_[("grid", B, J, False, 0.5)], R_[("grid", B, J, True, 0.5)]
            cells = [f"{fmt(c['eq'][f'M{M}_a0.05'])} / {fmt(c['eq'][f'M{M}_a0.0125'])}" for c in (u, m) for M in MARG]
            pr(f"| {B} | {J} | " + " | ".join(cells) + f" | {fmt(u['ni08'])} | {u['sd_pb']:.3f} | {m['sd_pb']:.3f} |")

    pr("\n## T5. Expert panel, J=8 judgments per brief-contrast, B=48")
    pr("Cell = naive cluster t / two-way (brief x expert) cluster-robust t with df = R-1.  Type I at alpha .05; power at alpha .05 (and .01 = Holm worst case over 5 expert contrasts).")
    pr("| panel R | expert sig_r | contrast | type I | win .58 | win .60 | win .62 | win .65 | win .62 @ .01 |")
    pr("|---|---|---|---|---|---|---|---|---|")
    for R in (12, 20):
        for sr in (P["sig_r_expert"], 0.5):
            for matched in (False, True):
                c = lambda w: R_[("exp", R, sr, matched, 48, w)]["tests"]
                ti = f"{fmt3(c(0.5)['cluster t']['two0.05'])} / {fmt3(c(0.5)['2way-CR t']['two0.05'])}"
                pw = [f"{fmt(c(w)['cluster t']['pos0.05'])} / {fmt(c(w)['2way-CR t']['pos0.05'])}" for w in (0.58, 0.60, 0.62, 0.65)]
                p01 = f"{fmt(c(0.62)['cluster t']['pos0.01'])} / {fmt(c(0.62)['2way-CR t']['pos0.01'])}"
                pr(f"| {R} | {sr} | {'M' if matched else 'U'} | {ti} | " + " | ".join(pw) + f" | {p01} |")
    pr("\nExpert panel at more briefs (sig_r expert assumed): two-way CR power at alpha .05, win .60 / .62")
    pr("| panel R | contrast | B=48 | B=60 | B=72 |")
    pr("|---|---|---|---|---|")
    for R in (12, 20):
        for matched in (False, True):
            cells = [f"{fmt(R_[('exp', R, P['sig_r_expert'], matched, B, 0.60)]['tests']['2way-CR t']['pos0.05'])} / "
                     f"{fmt(R_[('exp', R, P['sig_r_expert'], matched, B, 0.62)]['tests']['2way-CR t']['pos0.05'])}" for B in Bs]
            pr(f"| {R} | {'M' if matched else 'U'} | " + " | ".join(cells) + " |")

    pr("\n## T6. Sensitivity to variance components (J=24, cluster t). Cell = U win .60 @ alpha .025 / M win .58 @ alpha .0125")
    pr("| scenario | B=48 | B=60 | B=72 | sd(p_b) U / M at B=48 |")
    pr("|---|---|---|---|---|")
    for sname in sens:
        cells = [f"{fmt(R_[('sens', sname, B, False, 0.60)]['tests']['cluster t']['pos0.025'])} / "
                 f"{fmt(R_[('sens', sname, B, True, 0.58)]['tests']['cluster t']['pos0.0125'])}" for B in Bs]
        sd = f"{R_[('sens', sname, 48, False, 0.60)]['sd_pb']:.3f} / {R_[('sens', sname, 48, True, 0.58)]['sd_pb']:.3f}"
        pr(f"| {sname} | " + " | ".join(cells) + f" | {sd} |")
    txt = "\n".join(out)
    print(txt)
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "power_sim3_results.json"), "w") as f:
        json.dump(results, f, indent=1, default=float)
    print(f"\n(elapsed {time.time() - T0:.0f}s)")


if __name__ == "__main__":
    main()
