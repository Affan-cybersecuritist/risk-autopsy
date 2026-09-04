"""
Risk Autopsy - adversarial attack coverage map.

WHY THIS EXISTS: src/drift_monitor.py found, and src/remediate_drift.py
fixed, one specific coverage gap (strike timing under 10 days). That
finding was a paragraph. This turns it into a reusable diagnostic: for
each behavioral DIMENSION a real ring can vary (not just the one dimension
that happened to break), sweep that dimension across its full realistic
range while holding everything else at a value already known to look like
abuse, and measure what fraction of that sweep the policy actually catches.

This is a real, computed percentage per dimension - not a decorative bar
chart. It's run against both the pre-remediation policy
(discovered_policy_final.joblib, the one drift_monitor.py tested) and the
post-remediation policy (discovered_policy_remediated.joblib), so the
before/after comparison is the same real "strike timing" gap
remediate_drift.py already demonstrated, now placed in context next to
every other dimension - most of which were already well covered even
before that fix, which is itself worth showing plainly rather than
implying everything was broken.

Output: data/attack_coverage_results.json
"""
import os
import json
import joblib
import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

X_COLS = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]

# A "typical already-caught" abuse pattern - the fixed point every
# dimension sweep holds everything else at, so the sweep isolates exactly
# one behavioral axis at a time.
BASE_PATTERN = {"n_purchases_before_max": 2, "low_amount": 1500, "mid_amount": 20000,
                "time_to_escalation": 20, "device_sharing": 2, "address_sharing": 2}

N_SWEEP = 200


def _rows_from_pattern(overrides_list: list[dict]) -> pd.DataFrame:
    rows = []
    for ov in overrides_list:
        p = {**BASE_PATTERN, **ov}
        low = p["low_amount"]
        mid = p["mid_amount"]
        rows.append({
            "n_purchases_before_max": p["n_purchases_before_max"],
            "max_amount": mid,
            "escalation_ratio": mid / low if low > 0 else 1.0,
            "time_to_escalation": p["time_to_escalation"],
            "account_age_at_escalation": p["time_to_escalation"] + 7,
            "device_sharing": p["device_sharing"],
            "address_sharing": p["address_sharing"],
        })
    return pd.DataFrame(rows)


def _dimension_sweeps() -> dict:
    rng = np.random.default_rng(2028)
    return {
        "Amount manipulation": _rows_from_pattern(
            [{"mid_amount": v} for v in rng.uniform(8000, 60000, N_SWEEP)]),
        "Ring density": _rows_from_pattern(
            [{"device_sharing": v, "address_sharing": v} for v in rng.integers(0, 4, N_SWEEP)]),
        "Device sharing": _rows_from_pattern(
            [{"device_sharing": v} for v in rng.integers(0, 4, N_SWEEP)]),
        "Address sharing": _rows_from_pattern(
            [{"address_sharing": v} for v in rng.integers(0, 4, N_SWEEP)]),
        "Strike timing": _rows_from_pattern(
            [{"time_to_escalation": v} for v in rng.integers(1, 30, N_SWEEP)]),
    }


def compute_coverage(tree) -> dict:
    sweeps = _dimension_sweeps()
    out = {}
    for dim, df in sweeps.items():
        pred = tree.predict(df[X_COLS])
        out[dim] = round(float(pred.mean()) * 100, 1)
    return out


def run() -> dict:
    pre_tree = joblib.load(os.path.join(DATA, "discovered_policy_final.joblib"))
    pre = compute_coverage(pre_tree)

    post = None
    post_path = os.path.join(DATA, "discovered_policy_remediated.joblib")
    if os.path.exists(post_path):
        post_tree = joblib.load(post_path)
        post = compute_coverage(post_tree)

    result = {
        "dimensions": list(pre.keys()),
        "pre_remediation": pre,
        "post_remediation": post,
        "method": (f"For each dimension, {N_SWEEP} synthetic abuse-pattern points sweep that "
                   "dimension across its realistic range while holding every other dimension at "
                   "a value already known to look like abuse; coverage = % of the sweep the policy "
                   "flags. Same realistic-archetype ranges used throughout this project's "
                   "adversarial testing (src/coevolution.py, src/remediate_drift.py)."),
    }
    print("=== Attack coverage map ===")
    for dim in pre:
        line = f"{dim:22s} pre={pre[dim]:5.1f}%"
        if post:
            line += f"  post={post[dim]:5.1f}%"
        print(line)
    return result


if __name__ == "__main__":
    result = run()
    with open(os.path.join(DATA, "attack_coverage_results.json"), "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/attack_coverage_results.json")
