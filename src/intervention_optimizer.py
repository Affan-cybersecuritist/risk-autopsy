"""
Risk Autopsy - Economic Intervention Optimizer.

WHY THIS EXISTS: every policy in this project so far outputs a binary
ALLOW/FLAG decision. A real risk team has more than two levers - step-up
verification, a hold/delay, manual review - each preventing a different
fraction of the loss at a different friction cost to a genuine customer.
Collapsing that into one threshold throws away real economic value: some
customers are worth a light-touch delay, others are only worth blocking
outright.

METHOD: reuses off_policy_eval.py's reward function
(reward_if_flagged: +loss_rs if truly abuse, -FP_COST if genuine) and the
project's existing FP_COST=150 constant, extended from a single action to
a graded ladder. For every held-out test customer, expected_net_value(a) =
P(abuse|x) * loss_rs * prevent_frac(a) - P(genuine|x) * friction_cost(a),
using the discovered policy tree's predict_proba for P(abuse|x). The
optimizer picks argmax_a expected_net_value(a) per customer.

HONESTY NOTE: prevent_frac and friction_cost per action are engineering
estimates, not measured - disclosed as such in the output, same standard
this project already holds every other undocumented constant to (e.g.
FP_COST_PER_CASE itself). Nothing here claims these are real Razorpay
costs.

A SECOND HONESTY NOTE, found while building this: the auditable decision
tree (discovered_policy_final.joblib) is the one hardened through the full
adversarial arms race, and its leaves are consequently near-pure (0 or 1) -
its predict_proba is effectively binary, which collapses a 5-action ladder
back down to just ALLOW/BLOCK and defeats the entire point of grading
actions. That auditable tree is still the right artifact for the actual
governed ALLOW/FLAG decision and its rule_text is what a human approves -
but a graded action ladder needs an actual continuous risk estimate. So
this file separately fits a RandomForestClassifier over the exact same
leakage-free X_cols (same technique this project already uses for economic
modeling - see off_policy_eval.py's q_hat regressor) purely to produce a
calibrated P(abuse|x) for the optimizer's action selection. This forest is
NOT a competing policy and is never registered/approved - it only feeds
the intervention optimizer's risk score.

Output: data/intervention_optimizer_results.json
"""
import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

X_COLS = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]
FP_COST = 150.0  # same constant used project-wide (off_policy_eval.py, features_and_policy.py)

# Engineering-estimated action ladder - disclosed, not measured. Ordered
# ALLOW -> BLOCK by increasing intervention strength.
ACTION_DEFINITIONS = [
    {"action": "ALLOW", "prevent_frac": 0.0, "friction_cost": 0.0,
     "rationale": "No intervention."},
    {"action": "STEP_UP", "prevent_frac": 0.55, "friction_cost": 40.0,
     "rationale": "Extra verification (OTP/3DS) - many rings abandon under scrutiny, but not all."},
    {"action": "DELAY", "prevent_frac": 0.65, "friction_cost": 60.0,
     "rationale": "Hold the transaction briefly - buys time for a secondary signal to fire."},
    {"action": "MANUAL_REVIEW", "prevent_frac": 0.85, "friction_cost": FP_COST,
     "rationale": "Human review - reuses this project's existing FP_COST=150 as the literal review cost."},
    {"action": "BLOCK", "prevent_frac": 1.0, "friction_cost": 800.0,
     "rationale": "Hard block - full prevention, but full lost-transaction + support cost if wrong."},
]


BLOCK_FRICTION_COST = ACTION_DEFINITIONS[-1]["friction_cost"]  # BLOCK's cost, reused by the binary-policy comparison below


def compute_binary_net_value(tree, x_cols: list[str], feat_test: pd.DataFrame) -> float:
    """Real economic value (Rs) of a plain binary ALLOW/BLOCK policy - the
    same reward shape as this project's off_policy_eval.py
    (reward_if_flagged), extended to use BLOCK's real friction cost
    instead of the flat FP_COST, for a fair comparison against the graded
    ladder's own binary-equivalent baseline. Used as the 'Economic value'
    readiness gate in backend/agent.py so a new candidate policy is
    checked against real Rs, not just precision/recall."""
    pred = tree.predict(feat_test[x_cols])
    is_abuse = feat_test["is_abuse_ring"].values
    loss_rs = feat_test["loss_rs"].values
    value = np.where(
        pred == 1,
        np.where(is_abuse == 1, loss_rs, -BLOCK_FRICTION_COST),
        0.0,
    )
    return float(value.sum())


def compute_economic_breakdown(tree, x_cols: list[str], feat_test: pd.DataFrame) -> dict:
    """Same reward shape as compute_binary_net_value, but returns the
    components instead of only the sum - loss prevented (true positives)
    and false-positive cost (BLOCK's real friction cost, not the flat
    FP_COST), so a reviewer sees WHERE the net value comes from, not just
    the total. Used by ablation_study.py and policy_history entries."""
    pred = tree.predict(feat_test[x_cols])
    is_abuse = feat_test["is_abuse_ring"].values
    loss_rs = feat_test["loss_rs"].values

    loss_prevented = float(loss_rs[(pred == 1) & (is_abuse == 1)].sum())
    n_false_positives = int(((pred == 1) & (is_abuse == 0)).sum())
    false_positive_cost = float(n_false_positives * BLOCK_FRICTION_COST)
    net_value = loss_prevented - false_positive_cost

    return {
        "loss_prevented_rs": round(loss_prevented, 2),
        "false_positives": n_false_positives,
        "false_positive_cost_rs": round(false_positive_cost, 2),
        "net_value_rs": round(net_value, 2),
    }


def compute_expected_net_value(p_abuse: np.ndarray, loss_rs: np.ndarray,
                                action_definitions=ACTION_DEFINITIONS) -> dict:
    """For each customer (given P(abuse) and their loss_rs), compute
    expected net value under every action, and the optimizer's argmax
    choice. Returns per-customer arrays plus the chosen action list."""
    p_genuine = 1.0 - p_abuse
    values = {}  # action -> np.ndarray of expected net value per customer
    for a in action_definitions:
        values[a["action"]] = (
            p_abuse * loss_rs * a["prevent_frac"] - p_genuine * a["friction_cost"]
        )
    action_names = [a["action"] for a in action_definitions]
    stacked = np.stack([values[a] for a in action_names], axis=1)
    best_idx = stacked.argmax(axis=1)
    best_action = np.array(action_names)[best_idx]
    best_value = stacked[np.arange(len(stacked)), best_idx]
    return {"per_action_value": values, "chosen_action": best_action, "chosen_value": best_value}


def _load_split():
    """Identical ring-grouped split logic to features_and_policy.py /
    policy_history.py - so the risk-scoring forest is trained on the same
    train set as everything else, never on held-out test customers."""
    customers = pd.read_csv(os.path.join(DATA, "customers.csv"))
    feat = pd.read_csv(os.path.join(DATA, "features.csv"))
    txns = pd.read_csv(os.path.join(DATA, "transactions.csv"))
    chargeback_loss = txns[txns.txn_type == "chargeback"].groupby("customer_id").amount.sum()
    feat["loss_rs"] = feat.customer_id.map(chargeback_loss).fillna(0)

    cust_group = customers.set_index("customer_id")["address_id"]
    feat["group_id"] = feat.customer_id.map(cust_group)

    rng = np.random.default_rng(42)
    groups = np.array(feat["group_id"].unique().astype(str).tolist())
    rng.shuffle(groups)
    n_test_groups = int(len(groups) * 0.3)
    test_groups = set(groups[:n_test_groups])

    is_test = feat["group_id"].isin(test_groups)
    return feat[~is_test].copy(), feat[is_test].copy()


def run() -> dict:
    tree = joblib.load(os.path.join(DATA, "discovered_policy_final.joblib"))
    test_set = pd.read_csv(os.path.join(DATA, "test_set.csv"))

    feat_train, _ = _load_split()
    risk_scorer = RandomForestClassifier(n_estimators=300, max_depth=6, random_state=42,
                                          class_weight="balanced", n_jobs=-1)
    risk_scorer.fit(feat_train[X_COLS], feat_train["is_abuse_ring"])

    X_test = test_set[X_COLS]
    loss_rs = test_set["loss_rs"].values
    is_abuse = test_set["is_abuse_ring"].values

    p_abuse = risk_scorer.predict_proba(X_test)[:, 1] if 1 in risk_scorer.classes_ else np.zeros(len(X_test))

    opt = compute_expected_net_value(p_abuse, loss_rs)
    chosen_action = opt["chosen_action"]
    chosen_value = opt["chosen_value"]

    total_net_value_optimizer = float(chosen_value.sum())

    # Binary policy's real net value (ALLOW everywhere the tree says 0,
    # BLOCK everywhere it says 1) - same helper used for the "Economic
    # value" readiness gate in backend/agent.py, so this summary number
    # and that gate can never silently drift apart.
    total_net_value_binary_policy = compute_binary_net_value(tree, X_COLS, test_set)

    # Naive allow-everyone baseline: every abuse customer's loss is realized in full.
    allow_all_value = np.where(is_abuse == 1, -loss_rs, 0.0)
    total_net_value_allow_all = float(allow_all_value.sum())

    per_customer_actions = [
        {
            "customer_id": int(cid),
            "action": act,
            "expected_net_value": round(float(val), 2),
            "p_abuse": round(float(p), 4),
        }
        for cid, act, val, p in zip(test_set["customer_id"], chosen_action, chosen_value, p_abuse)
    ]

    action_counts = pd.Series(chosen_action).value_counts().to_dict()

    # ---------------------------------------------------------------
    # Honesty check: this dataset's abuse rings share device/address ids
    # by construction, which makes them near-perfectly separable - most
    # real test customers land at p_abuse near 0 or near 1, so the ladder
    # mostly resolves to ALLOW/BLOCK in practice (see n_ambiguous below).
    # That's a real property of this data, not a bug in the optimizer. To
    # show the ladder's mechanism actually has middle-action transitions
    # (not just two corners), sweep a SYNTHETIC p_abuse grid at a fixed
    # representative loss_rs - same diagnostic-sweep technique this
    # project already uses in attack_coverage.py (synthetic points to
    # illustrate a mechanism, never presented as real customer records).
    # ---------------------------------------------------------------
    n_ambiguous = int(((p_abuse > 0.1) & (p_abuse < 0.9)).sum())
    representative_loss_rs = float(test_set.loc[test_set.is_abuse_ring == 1, "loss_rs"].mean())
    p_grid = np.linspace(0.0, 1.0, 101)
    grid_result = compute_expected_net_value(p_grid, np.full_like(p_grid, representative_loss_rs))
    decision_boundary_curve = [
        {"p_abuse": round(float(p), 2), "optimal_action": a}
        for p, a in zip(p_grid, grid_result["chosen_action"])
    ]
    boundary_transitions = []
    prev = None
    for pt in decision_boundary_curve:
        if pt["optimal_action"] != prev:
            boundary_transitions.append(pt)
            prev = pt["optimal_action"]

    result = {
        "action_definitions": ACTION_DEFINITIONS,
        "per_customer_actions": per_customer_actions,
        "action_counts": {k: int(v) for k, v in action_counts.items()},
        "total_net_value_optimizer": round(total_net_value_optimizer, 2),
        "total_net_value_binary_policy": round(total_net_value_binary_policy, 2),
        "total_net_value_allow_all": round(total_net_value_allow_all, 2),
        "improvement_vs_binary": round(total_net_value_optimizer - total_net_value_binary_policy, 2),
        "improvement_vs_allow_all": round(total_net_value_optimizer - total_net_value_allow_all, 2),
        "n_test_customers": int(len(test_set)),
        "n_ambiguous_customers": n_ambiguous,
        "separability_note": (
            f"Only {n_ambiguous} of {len(test_set)} held-out test customers had a real risk score "
            "strictly between 0.1 and 0.9 - this dataset's abuse rings share device/address ids by "
            "construction, which makes most customers near-perfectly separable. In practice the "
            "optimizer mostly resolves to ALLOW/BLOCK on THIS data, same as the binary policy - the "
            "graded middle actions (STEP_UP/DELAY/MANUAL_REVIEW) would matter most on messier "
            "real-world data with weaker separability. This is a property of the dataset, not a "
            "limitation of the optimizer - see decision_boundary_curve below for proof the "
            "mechanism itself does select every action for some region of risk."
        ),
        "decision_boundary_curve": decision_boundary_curve,
        "decision_boundary_transitions": boundary_transitions,
        "decision_boundary_representative_loss_rs": round(representative_loss_rs, 2),
        "method": (
            "For every held-out test customer, expected_net_value(action) = "
            "P(abuse|x)*loss_rs*prevent_frac(action) - P(genuine|x)*friction_cost(action). "
            "P(abuse|x) comes from a RandomForestClassifier (300 trees, max_depth=6) trained "
            "separately on the same leakage-free X_cols and train split as the governed policy - "
            "used ONLY to produce a continuous risk score for this ladder, not as a competing "
            "policy (the auditable discovered_policy_final.joblib decision tree, hardened through "
            "the full adversarial arms race, is near-binary at its leaves and is the artifact "
            "actually approved/deployed for the ALLOW/FLAG decision). The optimizer picks argmax "
            "over the 5-action ladder (ALLOW/STEP_UP/DELAY/MANUAL_REVIEW/BLOCK). prevent_frac and "
            "friction_cost per action are engineering estimates (disclosed above per action), not "
            "measured real-world figures - same disclosure standard as this project's existing "
            "FP_COST_PER_CASE=150 constant."
        ),
    }
    print("=== Economic Intervention Optimizer ===")
    print(f"Optimizer total net value:      Rs {total_net_value_optimizer:,.2f}")
    print(f"Binary policy total net value:  Rs {total_net_value_binary_policy:,.2f}")
    print(f"Allow-all total net value:      Rs {total_net_value_allow_all:,.2f}")
    print(f"Improvement vs binary policy:   Rs {result['improvement_vs_binary']:,.2f}")
    print(f"Action distribution: {result['action_counts']}")
    print(f"Ambiguous customers (0.1<p<0.9): {n_ambiguous} of {len(test_set)}")
    print(f"Decision boundary transitions (synthetic sweep, loss_rs=Rs{representative_loss_rs:,.0f}):")
    for t in boundary_transitions:
        print(f"  p_abuse >= {t['p_abuse']:.2f} -> {t['optimal_action']}")
    return result


if __name__ == "__main__":
    result = run()
    with open(os.path.join(DATA, "intervention_optimizer_results.json"), "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/intervention_optimizer_results.json")
