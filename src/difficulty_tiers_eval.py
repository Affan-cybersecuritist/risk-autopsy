"""
Risk Autopsy - difficulty tiers evaluation.

WHY THIS EXISTS: this project's own evasion-distance/intervention-optimizer
work found and disclosed a real weakness - the "easy" population is
near-perfectly separable (934/935 held-out customers score near-0% or
near-100% risk). A skeptical reviewer's next question is "does this
survive harder data, or is 100%/100%/0-FP an artifact of how easy this
particular synthetic population is?"

METHODOLOGY, AND A REAL MISTAKE FOUND WHILE BUILDING THIS: the first version
of this script retrained a fresh DecisionTreeClassifier on each tier's OWN
data. That's the wrong experiment - a freshly-retrained tree can just
re-learn whatever separates that tier's synthetic labels, which tells you
nothing about robustness (every tier scored ~100%, "adversarial" even
scored slightly BETTER than "easy" - a strong signal the test was measuring
the wrong thing). The honest question is "does the ALREADY-DEPLOYED,
ALREADY-HARDENED policy still work on data it was never trained on and is
genuinely harder by construction?" - i.e. a generalization/OOD test of the
frozen discovered_policy_final.joblib, never retrained here. Each tier is
generated FRESH with a seed (777) never used in training that policy, so
even the "easy" row is out-of-sample, not data the tree has seen before -
making the three tiers a fair, consistent comparison.

The 4th row ("drifted") is NOT a new generation - it reuses this project's
own already-computed, already-real drift-monitor findings
(data/drift_monitor_results.json / drift_monitor_remediated_results.json),
since that's exactly what those files already measure (recall collapsing
over simulated months, then recovering after remediation).

Output: data/difficulty_tiers_results.json
"""
import os
import sys
import json
import joblib
import numpy as np
from sklearn.metrics import precision_score, recall_score

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dataset_tiers import generate_population
from feature_engineering import build_features, X_COLS
from intervention_optimizer import compute_binary_net_value

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

HOLDOUT_SEED = 777  # distinct from the training seed (42) - every tier below is out-of-sample


def evaluate_tier(tree, tier: str) -> dict:
    rng = np.random.default_rng(HOLDOUT_SEED)
    customers, txns = generate_population(rng, tier)
    feat = build_features(customers, txns)

    chargeback_loss = txns[txns.txn_type == "chargeback"].groupby("customer_id").amount.sum()
    feat["loss_rs"] = feat.customer_id.map(chargeback_loss).fillna(0)

    X = feat[X_COLS]
    y = feat["is_abuse_ring"]
    pred = tree.predict(X)

    precision = precision_score(y, pred, zero_division=0)
    recall = recall_score(y, pred, zero_division=0)
    fp = int(((pred == 1) & (y == 0)).sum())
    fp_rate = fp / max(1, (y == 0).sum())
    net_value = compute_binary_net_value(tree, X_COLS, feat)

    return {
        "tier": tier, "n_customers": int(len(customers)), "n_abuse": int(customers.is_abuse_ring.sum()),
        "precision": round(float(precision), 4), "recall": round(float(recall), 4),
        "false_positives": fp, "fp_rate": round(float(fp_rate), 4),
        "net_value_rs": round(net_value, 2),
    }


def drift_row() -> dict | None:
    pre_path = os.path.join(DATA, "drift_monitor_results.json")
    post_path = os.path.join(DATA, "drift_monitor_remediated_results.json")
    if not os.path.exists(pre_path):
        return None
    with open(pre_path) as f:
        pre = json.load(f)
    last_month_pre = pre["months"][-1]
    row = {
        "tier": "drifted", "note": "not a new generation - reuses drift_monitor.py's real simulation",
        "recall_at_month_1": round(pre["months"][0]["recall"], 4),
        "recall_at_final_month_pre_remediation": round(last_month_pre["recall"], 4),
        "alert_month": pre.get("alert_month"),
    }
    if os.path.exists(post_path):
        with open(post_path) as f:
            post = json.load(f)
        row["recall_at_final_month_post_remediation"] = round(post["months"][-1]["recall"], 4)
    return row


def run() -> dict:
    tree = joblib.load(os.path.join(DATA, "discovered_policy_final.joblib"))
    tiers = [evaluate_tier(tree, t) for t in ("easy", "ambiguous", "adversarial")]
    drift = drift_row()

    result = {
        "tiers": tiers,
        "drifted": drift,
        "policy_evaluated": "discovered_policy_final.joblib (frozen, never retrained on any tier below)",
        "method": (
            f"The already-hardened, already-frozen discovered_policy_final.joblib is scored "
            f"(never retrained) against three FRESH populations generated with seed={HOLDOUT_SEED} "
            "(distinct from the training seed 42, so even 'easy' here is out-of-sample) that are "
            "harder BY CONSTRUCTION (see src/dataset_tiers.py): 'easy' is the original population's "
            "generative distribution; 'ambiguous' adds genuine customers who look ring-like without "
            "being rings (shared corporate device, genuine gift escalation, genuine high-frequency "
            "buyers); 'adversarial' adds the same abuse-ring mechanics deliberately camouflaged "
            "(escalation spread across 2 purchases, wide strike-timing window, partial device "
            "sharing). This is a generalization/out-of-distribution test of one frozen policy, not "
            "a fresh-retrain-per-tier comparison - retraining per tier was tried first and found to "
            "be the wrong experiment (see this file's module docstring). 'drifted' reuses this "
            "project's own real drift-monitor simulation, not a new generation."
        ),
        "net_value_caveat": (
            "net_value_rs is NOT comparable across tiers - each tier has a different population "
            "size and total loss at stake by construction (ambiguous/adversarial add more "
            "customers). Compare precision/recall/fp_rate across tiers; net_value_rs is only "
            "meaningful within one tier."
        ),
    }
    print("=== Difficulty tiers evaluation ===")
    for t in tiers:
        print(f"{t['tier']:12s} precision={t['precision']:.1%} recall={t['recall']:.1%} "
              f"fp_rate={t['fp_rate']:.1%} net_value=Rs{t['net_value_rs']:,.0f}")
    if drift:
        print(f"{'drifted':12s} recall month1={drift['recall_at_month_1']:.1%} -> "
              f"final month (pre-remediation)={drift['recall_at_final_month_pre_remediation']:.1%}"
              + (f" -> post-remediation={drift['recall_at_final_month_post_remediation']:.1%}" if "recall_at_final_month_post_remediation" in drift else ""))
    return result


if __name__ == "__main__":
    result = run()
    with open(os.path.join(DATA, "difficulty_tiers_results.json"), "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/difficulty_tiers_results.json")
