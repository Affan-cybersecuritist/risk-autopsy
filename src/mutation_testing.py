"""
Risk Autopsy - Policy Mutation Testing.

WHY THIS EXISTS: this project already tests whether the POLICY works
(regression, adversarial coverage, evasion distance). This asks a
different, software-engineering-style question borrowed from mutation
testing: how fragile is the VERIFICATION SUITE ITSELF? Take the deployed
policy, deliberately break it in small, structurally valid ways, and check
whether the same regression gate this project already uses elsewhere
(precision >=85%, recall >=95% - the exact threshold
backend/agent.py::compute_readiness already applies) or a drop in real
economic net value would catch the broken version. A verification suite
that can't tell a mutated (broken) policy from the original isn't actually
verifying anything.

METHOD: sklearn's DecisionTreeClassifier exposes a mutable `tree_` C
structure (`.threshold`, `.feature`, `.children_left`, `.children_right`)
that can be edited directly on a deep copy - no retraining involved, this
mutates the ALREADY-FITTED tree's structure. Three structurally valid
mutation types are applied to every internal (non-leaf) node independently:
  - threshold_plus_10pct  - loosen/tighten a split by +10%
  - threshold_minus_10pct - loosen/tighten a split by -10%
  - invert                - swap the left/right children (flips which
                             branch a customer takes at that node)
A mutant that produces IDENTICAL predictions to the original on the held-out
test set is excluded from the score - there's nothing for the verification
suite to "catch" if the mutation had zero behavioral effect. Among mutants
that DO change at least one prediction, a mutant is "caught" if it fails
the regression gate or its net value drops below the original's.

mutation_score = caught / behaviorally-different mutants

Output: data/mutation_testing_results.json
"""
import os
import sys
import copy
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import precision_score, recall_score

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from intervention_optimizer import compute_binary_net_value

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

X_COLS = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]

# Same regression-gate thresholds backend/agent.py::compute_readiness already
# uses - a mutant is "caught" if it fails this same real bar, not a new one
# invented just for this file.
PRECISION_FLOOR = 0.85
RECALL_FLOOR = 0.95


def _internal_nodes(tree) -> list[int]:
    t = tree.tree_
    return [i for i in range(t.node_count) if t.feature[i] != -2]


def _mutate_threshold(tree, node_id: int, factor: float):
    mutant = copy.deepcopy(tree)
    mutant.tree_.threshold[node_id] *= factor
    return mutant


def _mutate_invert(tree, node_id: int):
    mutant = copy.deepcopy(tree)
    t = mutant.tree_
    left, right = t.children_left[node_id], t.children_right[node_id]
    t.children_left[node_id], t.children_right[node_id] = right, left
    return mutant


def generate_mutants(tree) -> list[dict]:
    mutants = []
    for node_id in _internal_nodes(tree):
        mutants.append({"node_id": int(node_id), "mutation_type": "threshold_plus_10pct",
                         "tree": _mutate_threshold(tree, node_id, 1.10)})
        mutants.append({"node_id": int(node_id), "mutation_type": "threshold_minus_10pct",
                         "tree": _mutate_threshold(tree, node_id, 0.90)})
        mutants.append({"node_id": int(node_id), "mutation_type": "invert",
                         "tree": _mutate_invert(tree, node_id)})
    return mutants


def run() -> dict:
    tree = joblib.load(os.path.join(DATA, "discovered_policy_final.joblib"))
    test_set = pd.read_csv(os.path.join(DATA, "test_set.csv"))
    X_test, y_test = test_set[X_COLS], test_set["is_abuse_ring"]

    original_pred = tree.predict(X_test)
    original_precision = precision_score(y_test, original_pred, zero_division=0)
    original_recall = recall_score(y_test, original_pred, zero_division=0)
    original_net_value = compute_binary_net_value(tree, X_COLS, test_set)

    mutants = generate_mutants(tree)
    per_mutation_type = {}
    detailed = []
    n_behaviorally_different = 0
    n_caught = 0

    for m in mutants:
        mutant_pred = m["tree"].predict(X_test)
        if np.array_equal(mutant_pred, original_pred):
            continue  # no behavioral effect - nothing to catch, excluded from the score
        n_behaviorally_different += 1

        precision = precision_score(y_test, mutant_pred, zero_division=0)
        recall = recall_score(y_test, mutant_pred, zero_division=0)
        net_value = compute_binary_net_value(m["tree"], X_COLS, test_set)

        gate_failed = precision < PRECISION_FLOOR or recall < RECALL_FLOOR
        value_regressed = net_value < original_net_value
        caught = bool(gate_failed or value_regressed)
        if caught:
            n_caught += 1

        mt = m["mutation_type"]
        bucket = per_mutation_type.setdefault(mt, {"total_behaviorally_different": 0, "caught": 0})
        bucket["total_behaviorally_different"] += 1
        bucket["caught"] += int(caught)

        detailed.append({
            "node_id": m["node_id"], "mutation_type": mt, "caught": caught,
            "precision": round(float(precision), 4), "recall": round(float(recall), 4),
            "net_value_rs": round(net_value, 2),
        })

    mutation_score = round(n_caught / n_behaviorally_different * 100, 1) if n_behaviorally_different else None

    result = {
        "original_precision": round(float(original_precision), 4),
        "original_recall": round(float(original_recall), 4),
        "original_net_value_rs": round(original_net_value, 2),
        "n_mutants_generated": len(mutants),
        "n_behaviorally_different": n_behaviorally_different,
        "n_caught": n_caught,
        "mutation_score_pct": mutation_score,
        "per_mutation_type": per_mutation_type,
        "detailed": detailed,
        "gate_thresholds": {"precision_floor": PRECISION_FLOOR, "recall_floor": RECALL_FLOOR},
        "sample_size_caveat": (
            f"discovered_policy_final.joblib is a shallow tree (depth {tree.get_depth()}, "
            f"{tree.tree_.node_count} nodes, {len(_internal_nodes(tree))} internal node(s)), so "
            f"only {len(mutants)} mutants exist and only {n_behaviorally_different} of them actually "
            "change any prediction. A 100% mutation score here means 'every mutation that did "
            "anything was caught,' not 'thousands of mutations were tested' - disclosed plainly, "
            "not inflated. A deeper/more complex candidate policy would exercise this test more."
        ),
        "method": (
            f"{len(mutants)} structural mutants generated from discovered_policy_final.joblib's "
            "already-fitted tree_ structure (threshold +-10%, or an inverted split, per internal "
            "node) - no retraining. Mutants producing identical predictions to the original are "
            "excluded (nothing to catch). Among the rest, 'caught' means the mutant fails this "
            "project's own regression gate (precision >=85%, recall >=95%, same thresholds "
            "backend/agent.py uses) or its real Rs net value drops below the original's."
        ),
    }
    print("=== Policy Mutation Testing ===")
    print(f"Mutants generated: {len(mutants)}, behaviorally different: {n_behaviorally_different}, "
          f"caught: {n_caught}")
    print(f"Mutation score: {mutation_score}%")
    for mt, bucket in per_mutation_type.items():
        print(f"  {mt:24s} {bucket['caught']}/{bucket['total_behaviorally_different']} caught")
    return result


if __name__ == "__main__":
    result = run()
    with open(os.path.join(DATA, "mutation_testing_results.json"), "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/mutation_testing_results.json")
