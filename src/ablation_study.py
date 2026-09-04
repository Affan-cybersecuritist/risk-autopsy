"""
Risk Autopsy - ablation study.

WHY THIS EXISTS: a reviewer should be able to ask "which part of this
pipeline actually earns its place?" and get a real answer, not an
assertion. Every stage below is an ALREADY-REAL, already-committed
artifact this project produced elsewhere - the baseline threshold rule
(results.json), the discovered behavioral policy (discovered_policy.joblib,
v1), the adversarially-hardened policy (discovered_policy_final.joblib, v2
in policy_history.json), the drift-remediated policy
(discovered_policy_remediated.joblib, v3), and the economic intervention
optimizer layered on top of v3 (intervention_optimizer_results.json).

This file does NOT retrain anything - it loads each stage's real tree and
scores it identically on the SAME held-out test_set.csv (using
compute_binary_net_value/compute_economic_breakdown for a consistent Rs
number across stages), so the comparison is apples-to-apples: same test
population, same reward function, different policy per row.

Output: data/ablation_results.json
"""
import os
import sys
import json
import joblib
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from intervention_optimizer import compute_economic_breakdown

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

X_COLS = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]


def _baseline_breakdown(test_set: pd.DataFrame) -> dict:
    """The baseline isn't a fitted tree - it's the fixed threshold rule
    (max_amount > Rs 25,000). Same reward shape as compute_economic_breakdown,
    computed directly since there's no tree to call .predict() on."""
    from intervention_optimizer import BLOCK_FRICTION_COST
    pred = (test_set["max_amount"] > 25000).astype(int)
    is_abuse = test_set["is_abuse_ring"].values
    loss_rs = test_set["loss_rs"].values
    loss_prevented = float(loss_rs[(pred == 1) & (is_abuse == 1)].sum())
    n_fp = int(((pred == 1) & (is_abuse == 0)).sum())
    fp_cost = float(n_fp * BLOCK_FRICTION_COST)
    return {"loss_prevented_rs": round(loss_prevented, 2), "false_positives": n_fp,
            "false_positive_cost_rs": round(fp_cost, 2), "net_value_rs": round(loss_prevented - fp_cost, 2)}


def run() -> dict:
    test_set = pd.read_csv(os.path.join(DATA, "test_set.csv"))

    stages = []

    stages.append({"stage": "Baseline (amount > Rs 25,000)", **_baseline_breakdown(test_set)})

    v1 = joblib.load(os.path.join(DATA, "discovered_policy.joblib"))
    stages.append({"stage": "+ Behavioral features (v1)", **compute_economic_breakdown(v1, X_COLS, test_set)})

    v2_path = os.path.join(DATA, "discovered_policy_final.joblib")
    if os.path.exists(v2_path):
        v2 = joblib.load(v2_path)
        stages.append({"stage": "+ Adversarial hardening (v2)", **compute_economic_breakdown(v2, X_COLS, test_set)})

    v3_path = os.path.join(DATA, "discovered_policy_remediated.joblib")
    if os.path.exists(v3_path):
        v3 = joblib.load(v3_path)
        stages.append({"stage": "+ Drift remediation (v3)", **compute_economic_breakdown(v3, X_COLS, test_set)})

    io_path = os.path.join(DATA, "intervention_optimizer_results.json")
    if os.path.exists(io_path):
        with open(io_path) as f:
            io_result = json.load(f)
        stages.append({
            "stage": "+ Economic intervention optimizer",
            "loss_prevented_rs": None,  # not decomposed the same way - it's a 5-action ladder, not binary
            "false_positives": None,
            "false_positive_cost_rs": None,
            "net_value_rs": io_result["total_net_value_optimizer"],
            "note": "Graded ladder net value from intervention_optimizer.py, evaluated on its own "
                    "test population (same test_set.csv) - not directly loss/FP-decomposable the "
                    "same way as the binary stages above, since it spans 5 actions, not 2.",
        })

    result = {
        "stages": stages,
        "method": (
            "Each stage is an already-real, already-committed policy artifact from this project's "
            "own pipeline, scored on the SAME held-out test_set.csv with the same reward function "
            "(compute_economic_breakdown/compute_binary_net_value) - no retraining happens in this "
            "script. This answers 'which stage earns its place' using real numbers already produced "
            "elsewhere, not a new experiment."
        ),
    }
    print("=== Ablation study ===")
    for s in stages:
        nv = s["net_value_rs"]
        print(f"{s['stage']:38s} net value = Rs{nv:,.0f}" if nv is not None else f"{s['stage']:38s} net value = n/a")
    return result


if __name__ == "__main__":
    result = run()
    with open(os.path.join(DATA, "ablation_results.json"), "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/ablation_results.json")
