"""
Risk Autopsy - secret holdout evaluation.

WHY THIS EXISTS: every evaluation elsewhere in this project (the held-out
test split, the adversarial arms race, the drift simulation) is built and
run by the same person who built the policy, on the same generator family.
A serious ML reviewer's question is "did you optimize everything against
your own simulator?" This is the honest, limited answer available to a
synthetic-only project: a population generated with a seed (9999) that is
NEVER referenced anywhere else in this codebase's history, scored by a
SINGLE, ONE-SHOT run of this script against the already-frozen
discovered_policy_final.joblib - no retraining, no threshold tuning, no
looking at the score and adjusting anything in response.

WHAT THIS DOES NOT CLAIM: this is still the same generator family
(src/dataset_tiers.py's "easy" tier logic) - it is NOT independent
real-world data, and running it doesn't prove the policy works on real
transactions. It proves the specific, narrower thing a secret holdout CAN
prove for synthetic data: the reported held-out numbers are not an
artifact of which exact seed-42 test split got used, because seed 9999 was
never touched during every other stage of development in this repo.

Output: data/secret_holdout_results.json
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

SECRET_SEED = 9999  # never used anywhere else in this pipeline's development


def run() -> dict:
    tree = joblib.load(os.path.join(DATA, "discovered_policy_final.joblib"))

    rng = np.random.default_rng(SECRET_SEED)
    customers, txns = generate_population(rng, tier="easy")
    feat = build_features(customers, txns)
    chargeback_loss = txns[txns.txn_type == "chargeback"].groupby("customer_id").amount.sum()
    feat["loss_rs"] = feat.customer_id.map(chargeback_loss).fillna(0)

    X, y = feat[X_COLS], feat["is_abuse_ring"]
    pred = tree.predict(X)

    precision = precision_score(y, pred, zero_division=0)
    recall = recall_score(y, pred, zero_division=0)
    fp = int(((pred == 1) & (y == 0)).sum())
    fp_rate = fp / max(1, (y == 0).sum())
    net_value = compute_binary_net_value(tree, X_COLS, feat)

    result = {
        "secret_seed": SECRET_SEED,
        "n_customers": int(len(customers)), "n_abuse": int(customers.is_abuse_ring.sum()),
        "precision": round(float(precision), 4), "recall": round(float(recall), 4),
        "false_positives": fp, "fp_rate": round(float(fp_rate), 4),
        "net_value_rs": round(net_value, 2),
        "policy_evaluated": "discovered_policy_final.joblib (frozen, never retrained or tuned against this seed)",
        "scope_note": (
            "This mitigates 'did you optimize against your own held-out split' as much as a "
            "synthetic-only project can - seed 9999 was never referenced during training, "
            "hardening, or any hyperparameter choice in this repo. It does NOT prove real-world "
            "fraud-detection accuracy - it's the same generator family (src/dataset_tiers.py's "
            "'easy' tier), not independent real transaction data. See README's Data Honesty section."
        ),
    }
    print("=== Secret holdout evaluation (seed 9999, one-shot, never tuned against) ===")
    print(f"Precision: {result['precision']:.1%}  Recall: {result['recall']:.1%}  "
          f"FP rate: {result['fp_rate']:.1%}  Net value: Rs{result['net_value_rs']:,.0f}")
    return result


if __name__ == "__main__":
    result = run()
    with open(os.path.join(DATA, "secret_holdout_results.json"), "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/secret_holdout_results.json")
