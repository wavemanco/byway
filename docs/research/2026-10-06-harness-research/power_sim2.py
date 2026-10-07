import numpy as np
from scipy import stats
rng = np.random.default_rng(7)
def expit(x): return 1/(1+np.exp(-x))

def draw_pair_q(K, sig_c, rho):
    # candidate qualities for arm A and X; rho = lineage correlation (shared pre-branch root)
    shared = rng.normal(0, sig_c*np.sqrt(rho), K)
    qa = shared + rng.normal(0, sig_c*np.sqrt(1-rho), K)
    qx = shared + rng.normal(0, sig_c*np.sqrt(1-rho), K)
    return qa, qx

def marginal(delta, tau_b, sig_c, sig_r, rho, n=300000):
    d = rng.normal(delta, tau_b, n) + rng.normal(0, sig_c*np.sqrt(2*(1-rho)), n) + rng.normal(0, sig_r, n)
    return expit(d).mean()

def calibrate(target, tau_b, sig_c, sig_r, rho):
    lo, hi = 0.0, 3.0
    for _ in range(35):
        mid = (lo+hi)/2
        if marginal(mid, tau_b, sig_c, sig_r, rho) < target: lo = mid
        else: hi = mid
    return (lo+hi)/2

def power(delta, B, J, K=4, tau_b=0.5, sig_c=0.8, sig_r=0.5, rho=0.0, matched=False, n_raters=800, alpha=0.05, reps=1000):
    hits = 0
    for _ in range(reps):
        u = rng.normal(0, sig_r, n_raters)
        props = np.empty(B)
        for b in range(B):
            db = rng.normal(delta, tau_b)
            qa, qx = draw_pair_q(K, sig_c, rho)
            ia = rng.integers(0, K, J)
            ix = ia if matched else rng.integers(0, K, J)
            r = rng.integers(0, n_raters, J)
            props[b] = (rng.random(J) < expit(db + qa[ia] - qx[ix] + u[r])).mean()
        t, p = stats.ttest_1samp(props, 0.5)
        if t > 0 and p < alpha: hits += 1
    return hits/reps

tau_b, sig_c, sig_r = 0.5, 0.8, 0.5
print("Scenario U: unmatched contrasts (C1 vs baselines, C1 vs -SEED). Family alpha 0.05/3 (Holm worst case)")
for target in [0.60, 0.62, 0.65]:
    d = calibrate(target, tau_b, sig_c, sig_r, 0.0)
    for K in [4, 6]:
        out = [f"B={B}:{power(d, B, 24, K=K, alpha=0.05/3):.2f}" for B in [32, 40, 48, 60]]
        print(f" win={target} K={K} J=24 | " + " ".join(out))
print("\nScenario M: matched-lineage branched ablations (rho=0.6, same-candidate pairs). Family alpha 0.05/4")
for target in [0.57, 0.58, 0.60]:
    d = calibrate(target, tau_b, sig_c, sig_r, 0.6)
    out = [f"B={B}:{power(d, B, 24, K=4, rho=0.6, matched=True, alpha=0.05/4):.2f}" for B in [32, 40, 48, 60]]
    print(f" win={target} K=4 J=24 | " + " ".join(out))
print("\nSensitivity: larger brief heterogeneity tau_b=0.8, unmatched, win=0.62, K=4, J=24, alpha=0.05/3")
d = calibrate(0.62, 0.8, sig_c, sig_r, 0.0)
print("  " + " ".join(f"B={B}:{power(d, B, 24, K=4, tau_b=0.8, alpha=0.05/3):.2f}" for B in [40, 48, 60, 72]))
print("Sensitivity: smaller heterogeneity tau_b=0.3, sig_c=0.6, unmatched, win=0.60")
d = calibrate(0.60, 0.3, 0.6, sig_r, 0.0)
print("  " + " ".join(f"B={B}:{power(d, B, 24, K=4, tau_b=0.3, sig_c=0.6, alpha=0.05/3):.2f}" for B in [32, 40, 48]))
print("\nType I (unmatched, B=48,J=24, alpha=.05):", power(0.0, 48, 24, alpha=0.05, reps=2000))

print("\nExpert panel: J=8 per brief per contrast, sig_r=0.3, unmatched, alpha=0.05/3")
for target in [0.60, 0.62, 0.65]:
    d = calibrate(target, tau_b, sig_c, 0.3, 0.0)
    print(f" win={target} | " + " ".join(f"B={B}:{power(d, B, 8, K=4, sig_r=0.3, alpha=0.05/3):.2f}" for B in [48]))
# brief-level SD of win proportion under null, for equivalence planning
props=[]
for _ in range(3000):
    qa, qx = draw_pair_q(4, sig_c, 0.0)
    ia = rng.integers(0,4,24); ix = rng.integers(0,4,24)
    u = rng.normal(0, sig_r, 24)
    props.append((rng.random(24) < expit(rng.normal(0,tau_b)+qa[ia]-qx[ix]+u)).mean())
sd = np.std(props); print("\nbrief-level SD of win proportion (null, J=24):", round(sd,3), " 90% CI half-width at B=48:", round(1.678*sd/np.sqrt(48),3))
