"""
Risk Autopsy - per-customer decision-path attribution ("Causal Loss Graph").

SCOPE, STATED PLAINLY: this is NOT a claim about real-world causality. A
DecisionTreeClassifier has a genuinely exact, inspectable decision path
(sklearn's tree_.feature / tree_.threshold / tree_.children_left/right) -
so for a GIVEN customer's real feature values, we can say precisely which
split sent them left or right, and which leaf they landed in. That is a
true statement about THIS MODEL'S decision, not a statistical inference
about reality dressed up as causal. For a customer who was truly abuse but
predicted genuine (a real loss that slipped through), the path literally
shows the exact split that let them through - a genuine "which decision
node caused this policy to miss them" answer, scoped honestly to "in this
tree," never "in the real world."

Computed live per request (same pattern as backend/main.py's autopsy() -
cheap tree traversal, no batch script needed).
"""
import os
import joblib
import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

X_COLS = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]


def _feature_ranges(features_df: pd.DataFrame) -> dict:
    """Normalize 'how close was this split' by each feature's own observed
    range in the real dataset - avoids hardcoding a second, possibly
    drifting set of range constants alongside attack_coverage.py's."""
    return {c: (float(features_df[c].min()), float(features_df[c].max())) for c in X_COLS}


def build_decision_chain(tree, x_cols: list[str], customer_row: pd.Series, feature_ranges: dict) -> dict:
    t = tree.tree_
    node_id = 0
    path = []
    closest = None  # {"node_id", "feature", "gap_normalized"}

    while t.feature[node_id] != -2:  # -2 marks a leaf in sklearn's tree_
        feat_idx = t.feature[node_id]
        feature = x_cols[feat_idx]
        threshold = float(t.threshold[node_id])
        customer_value = float(customer_row[feature])
        goes_left = customer_value <= threshold
        direction = "<=" if goes_left else ">"

        lo, hi = feature_ranges.get(feature, (threshold - 1, threshold + 1))
        span = (hi - lo) if hi > lo else 1.0
        gap_normalized = abs(customer_value - threshold) / span

        path.append({
            "node_id": int(node_id),
            "feature": feature,
            "threshold": round(threshold, 3),
            "customer_value": round(customer_value, 3),
            "direction": direction,
        })
        if closest is None or gap_normalized < closest["gap_normalized"]:
            closest = {"node_id": int(node_id), "feature": feature, "gap_normalized": round(float(gap_normalized), 4)}

        node_id = int(t.children_left[node_id] if goes_left else t.children_right[node_id])

    leaf_values = t.value[node_id][0]
    predicted_class = int(np.argmax(leaf_values))
    class_distribution = {"genuine": int(leaf_values[0]), "abuse": int(leaf_values[1])} if len(leaf_values) > 1 else {}

    return {
        "path": path,
        "leaf_node_id": int(node_id),
        "predicted_class": "abuse" if predicted_class == 1 else "genuine",
        "leaf_class_distribution": class_distribution,
        "closest_call": closest,
    }


def get_causal_graph_for_customer(customer_id: int) -> dict | None:
    tree = joblib.load(os.path.join(DATA, "discovered_policy_final.joblib"))
    features = pd.read_csv(os.path.join(DATA, "features.csv"))
    txns = pd.read_csv(os.path.join(DATA, "transactions.csv"))

    row_matches = features[features.customer_id == customer_id]
    if len(row_matches) == 0:
        return None
    row = row_matches.iloc[0]

    chargeback_loss = txns[txns.txn_type == "chargeback"].groupby("customer_id").amount.sum()
    loss_rs = float(chargeback_loss.get(customer_id, 0.0))

    feature_ranges = _feature_ranges(features)
    chain = build_decision_chain(tree, X_COLS, row, feature_ranges)

    is_abuse = bool(row["is_abuse_ring"])
    predicted_abuse = chain["predicted_class"] == "abuse"
    outcome = (
        "caught" if (is_abuse and predicted_abuse) else
        "missed_loss" if (is_abuse and not predicted_abuse) else
        "false_positive" if (not is_abuse and predicted_abuse) else
        "correctly_allowed"
    )

    return {
        "customer_id": int(customer_id),
        "is_abuse_ring": is_abuse,
        "loss_rs": loss_rs,
        "outcome": outcome,
        "decision_chain": chain,
        "scope_note": (
            "This is the exact decision path THIS TREE took for this customer's real feature "
            "values (sklearn's own tree_.feature/threshold traversal) - a true statement about "
            "this model's decision, not a claim about real-world causality. 'closest_call' is the "
            "split where this customer's value was nearest the threshold, i.e. where a small "
            "behavioral change would have flipped this specific decision."
        ),
    }
