"""
Risk Autopsy - automated adversarial co-evolution (the novel capstone piece).

Instead of one hand-crafted adversarial round (adversarial_test.py), this runs
an AUTOMATED ARMS RACE: an attacker repeatedly searches for evasions of the
CURRENT policy within a realistic behavioral envelope (still recognizably the
same abuse archetype - escalate then extract value via a ring - just varying
amounts/timing/sharing), and a defender retrains after every successful round.
This continues until the attacker can no longer find any evasion within its
search budget - a genuine, measured robustness convergence, not a single
static test.

This is DEFENSE-ONLY: the attacker's search space is explicitly bounded to
the known abuse archetype (it does not search for new attack TYPES, only
parameter variations of the one we've already identified from real loss
data), and the loop's entire purpose is to harden our own policy before
deployment - not to produce a general-purpose evasion tool.

Output: a "robustness certificate" - the generation at which the arms race
converged, and the full generation-by-generation evasion-count trace.
"""
import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.metrics import precision_score, recall_score
import joblib
import json

rng = np.random.default_rng(2026)

X_cols = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]

# ---------------- Attacker's realistic search envelope ----------------
# Bounded to the SAME abuse archetype already found in the real loss autopsy
# (escalate then extract value via a ring) - the attacker varies HOW that
# archetype is executed, it does not invent a new fraud type.
def sample_attacker_candidates(n, rng):
    low_amount = rng.uniform(300, 3000, n)
    mid_amount = rng.uniform(8000, 60000, n)
    time_to_escalation = rng.integers(10, 30, n)
    account_age_at_escalation = time_to_escalation + rng.integers(2, 12, n)
    device_sharing = rng.choice([0, 1, 2, 3], size=n)
    address_sharing = rng.choice([0, 1, 2, 3], size=n)
    return pd.DataFrame({
        "n_purchases_before_max": 2,
        "max_amount": mid_amount,
        "escalation_ratio": mid_amount / low_amount,
        "time_to_escalation": time_to_escalation,
        "account_age_at_escalation": account_age_at_escalation,
        "device_sharing": device_sharing,
        "address_sharing": address_sharing,
        "is_abuse_ring": 1,
    })

SEARCH_BUDGET = 500       # candidates sampled per generation
MAX_GENERATIONS = 15
CONVERGENCE_THRESHOLD = 0  # arms race stops when a generation finds this few evasions

# ---------------- Start from policy v1 (leakage-free, ring-grouped) ----------------
current_tree = joblib.load("data/discovered_policy.joblib")
feat = pd.read_csv("data/features.csv")
test_set = pd.read_csv("data/test_set.csv")

train_pool = feat[X_cols + ["is_abuse_ring"]].copy()

generation_log = []
for gen in range(1, MAX_GENERATIONS + 1):
    candidates = sample_attacker_candidates(SEARCH_BUDGET, rng)
    preds = current_tree.predict(candidates[X_cols])
    evasions = candidates[preds == 0]  # candidates the CURRENT policy misses
    n_evasions = len(evasions)

    # regression check: does current policy still work on the original real test set?
    test_pred = current_tree.predict(test_set[X_cols])
    precision = precision_score(test_set.is_abuse_ring, test_pred, zero_division=0)
    recall = recall_score(test_set.is_abuse_ring, test_pred, zero_division=0)
    fp = int(((test_pred == 1) & (test_set.is_abuse_ring == 0)).sum())

    generation_log.append({
        "generation": gen, "evasions_found": int(n_evasions),
        "search_budget": SEARCH_BUDGET,
        "test_precision": float(precision), "test_recall": float(recall), "test_fp": fp,
    })
    print(f"Gen {gen}: {n_evasions}/{SEARCH_BUDGET} evasions found | "
          f"test precision={precision:.3f} recall={recall:.3f} fp={fp}")

    if n_evasions <= CONVERGENCE_THRESHOLD:
        print(f"\n*** CONVERGED at generation {gen}: attacker found zero evasions "
              f"in a budget of {SEARCH_BUDGET} within the known abuse archetype. ***")
        break

    # defender retrains, folding in every evasion found this round
    train_pool = pd.concat([train_pool, evasions[X_cols + ["is_abuse_ring"]]], ignore_index=True)
    current_tree = DecisionTreeClassifier(max_depth=6, min_samples_leaf=6, random_state=42,
                                           class_weight="balanced")
    current_tree.fit(train_pool[X_cols], train_pool["is_abuse_ring"])
else:
    print(f"\n*** Did NOT converge within {MAX_GENERATIONS} generations - policy still has "
          f"exploitable gaps in this search space. ***")

final_precision = generation_log[-1]["test_precision"]
final_recall = generation_log[-1]["test_recall"]
final_fp = generation_log[-1]["test_fp"]
converged = generation_log[-1]["evasions_found"] <= CONVERGENCE_THRESHOLD

joblib.dump(current_tree, "data/discovered_policy_final.joblib")

result = {
    "generation_log": generation_log,
    "converged": bool(converged),
    "converged_at_generation": generation_log[-1]["generation"] if converged else None,
    "final_precision": final_precision, "final_recall": final_recall, "final_fp": final_fp,
    "final_rule_text": export_text(current_tree, feature_names=X_cols),
    "search_budget_per_generation": SEARCH_BUDGET,
}
with open("data/coevolution_results.json", "w") as f:
    json.dump(result, f, indent=2)

print(f"\n=== Final robustness certificate ===")
print(f"Converged: {converged}  at generation: {result['converged_at_generation']}")
print(f"Final held-out precision/recall: {final_precision:.3f} / {final_recall:.3f}  FP: {final_fp}")
print("\nFinal policy rule:")
print(result["final_rule_text"])
print("\nSaved: data/discovered_policy_final.joblib, data/coevolution_results.json")
