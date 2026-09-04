"""
Risk Autopsy - feature engineering, baseline policy, and discovered policy.

IMPORTANT (fixed after brutal review): features here are restricted to
information available AT THE MOMENT of the escalated (high-value) purchase -
i.e. what you'd know if you were deciding whether to step-up-verify or flag
this transaction BEFORE any return/chargeback happens. Using return_rate or
return_lag as a feature was a temporal leakage bug (>0.88 correlation with
the label, because it directly encodes "did the loss already happen") -
removed entirely. The label (is_abuse_ring) is still fine as ground truth,
only the FEATURES must not use post-decision information.

Evaluation also fixed: split is now done PER-RING (device/address cluster),
not per-customer, so near-duplicate siblings from the same abuse ring can't
appear in both train and test (which would inflate the held-out score).
"""
import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.metrics import precision_score, recall_score
from feature_engineering import build_features

customers = pd.read_csv("data/customers.csv")
txns = pd.read_csv("data/transactions.csv")

print("Building features (leakage-free: no return/chargeback info)...")
feat = build_features(customers, txns)
feat.to_csv("data/features.csv", index=False)
print("Done:", feat.shape)

# ---------------- Loss ground truth (label only, never a feature) ----------------
chargeback_loss = txns[txns.txn_type == "chargeback"].groupby("customer_id").amount.sum()
feat["loss_rs"] = feat.customer_id.map(chargeback_loss).fillna(0)

# ---------------- Ring-level (grouped) train/test split ----------------
# Group key: for ring members this is their shared address_id; for standalone
# normal customers, each is its own group (their own unique address_id already).
cust_group = customers.set_index("customer_id")["address_id"]
feat["group_id"] = feat.customer_id.map(cust_group)

rng = np.random.default_rng(42)
groups = feat["group_id"].unique().astype(str)
rng.shuffle(groups)
n_test_groups = int(len(groups) * 0.3)
test_groups = set(groups[:n_test_groups])

is_test = feat["group_id"].isin(test_groups)
feat_train, feat_test = feat[~is_test].copy(), feat[is_test].copy()

X_cols = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]
X_train, y_train = feat_train[X_cols], feat_train["is_abuse_ring"]
X_test, y_test = feat_test[X_cols], feat_test["is_abuse_ring"]

print(f"\nTrain: {len(feat_train)} customers ({y_train.sum()} abuse-ring)")
print(f"Test:  {len(feat_test)} customers ({y_test.sum()} abuse-ring)  <- entire rings held out, no sibling leakage")

# ---------------- BASELINE POLICY: naive amount threshold ----------------
AMOUNT_THRESHOLD = 25000
baseline_pred = (X_test["max_amount"] > AMOUNT_THRESHOLD).astype(int)
baseline_precision = precision_score(y_test, baseline_pred, zero_division=0)
baseline_recall = recall_score(y_test, baseline_pred, zero_division=0)
baseline_loss_prevented = feat_test.loc[baseline_pred.values == 1, "loss_rs"].sum()
baseline_fp = ((baseline_pred == 1) & (y_test == 0)).sum()
FP_COST_PER_CASE = 150  # illustrative manual-review/step-up-verification cost per false positive
baseline_fp_cost = baseline_fp * FP_COST_PER_CASE

# ---------------- DISCOVERED POLICY: decision tree over PRE-DECISION features ----------------
tree = DecisionTreeClassifier(max_depth=4, min_samples_leaf=10, random_state=42, class_weight="balanced")
tree.fit(X_train, y_train)
tree_pred = tree.predict(X_test)
tree_precision = precision_score(y_test, tree_pred, zero_division=0)
tree_recall = recall_score(y_test, tree_pred, zero_division=0)
tree_loss_prevented = feat_test.loc[tree_pred == 1, "loss_rs"].sum()
tree_fp = ((tree_pred == 1) & (y_test == 0)).sum()
tree_fp_cost = tree_fp * FP_COST_PER_CASE

total_test_loss = feat_test["loss_rs"].sum()

print("\n=== BASELINE POLICY (amount > Rs 25,000) ===")
print(f"Precision: {baseline_precision:.3f}  Recall: {baseline_recall:.3f}")
print(f"Loss prevented: Rs {baseline_loss_prevented:,.0f} / Rs {total_test_loss:,.0f} total")
print(f"False positives: {baseline_fp}  FP cost: Rs {baseline_fp_cost:,.0f}")

print("\n=== DISCOVERED POLICY (decision tree, leakage-free features, ring-held-out test) ===")
print(f"Precision: {tree_precision:.3f}  Recall: {tree_recall:.3f}")
print(f"Loss prevented: Rs {tree_loss_prevented:,.0f} / Rs {total_test_loss:,.0f} total")
print(f"False positives: {tree_fp}  FP cost: Rs {tree_fp_cost:,.0f}")

print("\n=== Discovered rule (human-readable) ===")
print(export_text(tree, feature_names=X_cols))

results = {
    "baseline": {"precision": baseline_precision, "recall": baseline_recall,
                 "loss_prevented": float(baseline_loss_prevented), "fp": int(baseline_fp),
                 "fp_cost": float(baseline_fp_cost)},
    "discovered": {"precision": tree_precision, "recall": tree_recall,
                   "loss_prevented": float(tree_loss_prevented), "fp": int(tree_fp),
                   "fp_cost": float(tree_fp_cost)},
    "total_test_loss": float(total_test_loss),
    "rule_text": export_text(tree, feature_names=X_cols),
    "n_train": int(len(feat_train)), "n_test": int(len(feat_test)),
}
import json
with open("data/results.json", "w") as f:
    json.dump(results, f, indent=2)

import joblib
joblib.dump(tree, "data/discovered_policy.joblib")
X_test.assign(is_abuse_ring=y_test, customer_id=feat_test.customer_id, loss_rs=feat_test.loss_rs).to_csv("data/test_set.csv", index=False)
print("\nSaved: data/results.json, data/discovered_policy.joblib, data/test_set.csv")
