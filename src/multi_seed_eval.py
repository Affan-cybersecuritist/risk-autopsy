"""
Risk Autopsy - multi-seed evaluation.

WHY THIS EXISTS: this project's headline discovery numbers (90.6%
precision, 100% recall) come from ONE population, seed 42. A reviewer's
reasonable question: is that seed-fragile, or does the same discovery
pipeline land in roughly the same place across independent populations? 10
independent seeds, each with its own fresh population, ring-grouped split,
and freshly-trained v1-equivalent tree (same hyperparameters as
features_and_policy.py: DecisionTreeClassifier max_depth=4,
min_samples_leaf=10), report mean/std.

SCOPED DELIBERATELY TO THE DISCOVERY STAGE, not the full adversarial arms
race - running full co-evolution 10x would be slow and answers a different
question (this project's own drift-monitor/attack-coverage work already
answers "is the hardened policy robust"; this answers "is the discovered
policy's quality seed-fragile").

Output: data/multi_seed_eval_results.json
"""
import os
import sys
import json
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import precision_score, recall_score

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dataset_tiers import generate_population
from feature_engineering import build_features, ring_grouped_split, X_COLS
from intervention_optimizer import compute_binary_net_value

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

SEEDS = list(range(10))  # 0..9 - independent of the main pipeline's seed 42


def evaluate_seed(seed: int) -> dict:
    rng = np.random.default_rng(seed)
    customers, txns = generate_population(rng, tier="easy")
    feat = build_features(customers, txns)
    chargeback_loss = txns[txns.txn_type == "chargeback"].groupby("customer_id").amount.sum()
    feat["loss_rs"] = feat.customer_id.map(chargeback_loss).fillna(0)

    split_rng = np.random.default_rng(seed)
    feat_train, feat_test = ring_grouped_split(customers, feat, split_rng)

    X_train, y_train = feat_train[X_COLS], feat_train["is_abuse_ring"]
    X_test, y_test = feat_test[X_COLS], feat_test["is_abuse_ring"]

    tree = DecisionTreeClassifier(max_depth=4, min_samples_leaf=10, random_state=seed, class_weight="balanced")
    tree.fit(X_train, y_train)
    pred = tree.predict(X_test)

    precision = precision_score(y_test, pred, zero_division=0)
    recall = recall_score(y_test, pred, zero_division=0)
    fp = int(((pred == 1) & (y_test == 0)).sum())
    fp_rate = fp / max(1, (y_test == 0).sum())
    net_value = compute_binary_net_value(tree, X_COLS, feat_test)

    return {"seed": seed, "precision": float(precision), "recall": float(recall),
            "fp_rate": float(fp_rate), "net_value_rs": float(net_value)}


def run() -> dict:
    per_seed = [evaluate_seed(s) for s in SEEDS]

    def stats(key):
        vals = np.array([r[key] for r in per_seed])
        return {"mean": round(float(vals.mean()), 4), "std": round(float(vals.std()), 4)}

    result = {
        "n_seeds": len(SEEDS), "seeds": SEEDS, "per_seed": per_seed,
        "precision": stats("precision"), "recall": stats("recall"),
        "fp_rate": stats("fp_rate"), "net_value_rs": stats("net_value_rs"),
        "method": (
            f"{len(SEEDS)} independent seeds ({SEEDS[0]}-{SEEDS[-1]}), each generating a fresh "
            "population, ring-grouped 70/30 split, and a freshly-trained DecisionTreeClassifier "
            "(max_depth=4, min_samples_leaf=10 - same hyperparameters as this project's v1 in "
            "features_and_policy.py). Scoped to the discovery stage only, not the full adversarial "
            "arms race (see this file's module docstring for why)."
        ),
    }
    print("=== Multi-seed evaluation (10 seeds, discovery stage) ===")
    print(f"Precision: {result['precision']['mean']:.1%} +/- {result['precision']['std']:.1%}")
    print(f"Recall:    {result['recall']['mean']:.1%} +/- {result['recall']['std']:.1%}")
    print(f"FP rate:   {result['fp_rate']['mean']:.1%} +/- {result['fp_rate']['std']:.1%}")
    print(f"Net value: Rs{result['net_value_rs']['mean']:,.0f} +/- Rs{result['net_value_rs']['std']:,.0f}")
    return result


if __name__ == "__main__":
    result = run()
    with open(os.path.join(DATA, "multi_seed_eval_results.json"), "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/multi_seed_eval_results.json")
