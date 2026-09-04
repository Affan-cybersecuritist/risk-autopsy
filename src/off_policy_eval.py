"""
Risk Autopsy - real doubly-robust off-policy evaluation (OPE).

WHY THIS EXISTS: the earlier version of this project's README listed
"doubly-robust off-policy evaluation" as unbuilt roadmap. It's built now.

THE PROBLEM THIS SOLVES: our held-out precision/recall evaluation (in
features_and_policy.py) is a standard supervised-learning generalization
test. That's valid ONLY because our synthetic dataset happens to have full
ground-truth labels for every customer, regardless of what any policy
decided. In a REAL deployment, that assumption breaks: if the old policy
never flagged a customer, you don't get to rerun history to see what a NEW
policy would have done - you only have logged (context, action, reward)
triples from whatever policy was actually running. Naively evaluating a new
policy by just replaying logged outcomes is biased, because the customers
the old policy chose to act on are not a random sample.

THE HONEST MODELING CHOICE: our actual baseline policy (`max_amount >
25000`) is a hard deterministic threshold. Off-policy evaluation is
mathematically UNDEFINED for a deterministic logging policy (propensity is
exactly 0 or 1, so importance weights are 0 or infinite - zero overlap).
Real logged systems are essentially never perfectly deterministic anyway
(manual review exceptions, inconsistent enforcement, edge cases) - so we
model the logging policy as a SMOOTHED, STOCHASTIC version of the same
threshold rule (a logistic curve centered on ₹25,000), which is both more
realistic and mathematically valid for OPE. This is stated explicitly, not
hidden.

METHOD: doubly-robust (DR) estimator (Dudik, Langford & Li 2011 / standard
contextual-bandit OPE). Combines:
  - a direct outcome-regression model q_hat(x, a) (Direct Method), with
  - an inverse-propensity-weighted correction term using the logged action
    and the (now well-defined, non-degenerate) behavior-policy propensity.
DR is unbiased if EITHER the outcome model OR the propensity model is
correct (not both) - the standard reason DR is preferred over DM or IPS
alone.

VALIDATION: because our synthetic dataset uniquely has full oracle
ground-truth (every customer's true reward under every action, not just the
one that was "logged"), we can compute the TRUE value of the target policy
directly and check the DR estimator recovers it closely using ONLY the
logged (partial, biased) data - i.e. we can literally verify the estimator
is correct, not just plausible. Real deployments never get this luxury;
we're using it here purely to prove the method works before trusting it.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.tree import DecisionTreeClassifier
import joblib
import json

rng = np.random.default_rng(7)

X_cols = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]
FP_COST = 150.0
AMOUNT_THRESHOLD = 25000.0
LOGISTIC_SCALE = 4000.0  # controls how "fuzzy" the logged threshold enforcement was

feat = pd.read_csv("data/features.csv")
txns = pd.read_csv("data/transactions.csv")
chargeback_loss = txns[txns.txn_type == "chargeback"].groupby("customer_id").amount.sum()
feat["loss_rs"] = feat.customer_id.map(chargeback_loss).fillna(0)

# ---------------------------------------------------------------
# 1. Behavior policy propensity: smoothed logistic version of the baseline
#    threshold rule. e(x) = P(logged system flagged this customer | x)
# ---------------------------------------------------------------
def behavior_propensity(max_amount):
    z = (max_amount - AMOUNT_THRESHOLD) / LOGISTIC_SCALE
    e = 1 / (1 + np.exp(-z))
    return np.clip(e, 0.02, 0.98)  # avoid exact 0/1 - keeps overlap valid everywhere

feat["propensity"] = behavior_propensity(feat["max_amount"].values)

# ---------------------------------------------------------------
# 2. Simulate the LOGGED action for each customer: what the (now-stochastic)
#    behavior policy actually did, drawn from its own propensity - this is
#    the "historical log" a real system would have produced.
# ---------------------------------------------------------------
feat["logged_action"] = (rng.random(len(feat)) < feat["propensity"]).astype(int)

# ---------------------------------------------------------------
# 3. Reward under the action actually logged (this is what a real log would
#    contain - reward for the taken action only, nothing else observed)
# ---------------------------------------------------------------
def reward_if_flagged(is_abuse, loss_rs):
    return np.where(is_abuse == 1, loss_rs, -FP_COST)

reward_flag = reward_if_flagged(feat["is_abuse_ring"].values, feat["loss_rs"].values)
feat["logged_reward"] = np.where(feat["logged_action"] == 1, reward_flag, 0.0)

# ---------------------------------------------------------------
# 4. Target policy: the discovered v1 decision tree (deterministic 0/1)
# ---------------------------------------------------------------
tree_v1 = joblib.load("data/discovered_policy.joblib")
feat["target_action"] = tree_v1.predict(feat[X_cols])

# ---------------------------------------------------------------
# 5. Fit the outcome regression model q_hat(x, a) on LOGGED data only
#    (action included as a feature) - this is all a real system would have.
# ---------------------------------------------------------------
q_train_X = feat[X_cols + ["logged_action"]].rename(columns={"logged_action": "action"})
q_model = RandomForestRegressor(n_estimators=200, max_depth=6, random_state=42)
q_model.fit(q_train_X, feat["logged_reward"])

def q_hat(df, action_value):
    X = df[X_cols].copy()
    X["action"] = action_value
    return q_model.predict(X)

# ---------------------------------------------------------------
# 6. Doubly-robust estimator for V(target policy)
# ---------------------------------------------------------------
q_hat_target = q_hat(feat, feat["target_action"].values)
q_hat_logged = q_hat(feat, feat["logged_action"].values)

match = (feat["logged_action"].values == feat["target_action"].values).astype(float)
propensity_of_logged_action = np.where(
    feat["logged_action"].values == 1, feat["propensity"].values, 1 - feat["propensity"].values
)
ips_correction = match / propensity_of_logged_action * (feat["logged_reward"].values - q_hat_logged)

dr_per_customer = q_hat_target + ips_correction
V_dr = dr_per_customer.mean()

# ---------------------------------------------------------------
# Comparison estimators
# ---------------------------------------------------------------
V_dm = q_hat_target.mean()  # Direct Method only (relies entirely on model being correct)

ips_only = match / propensity_of_logged_action * feat["logged_reward"].values
V_ips = ips_only.mean()  # IPS only (relies entirely on propensity being correct, high variance)

# ---------------------------------------------------------------
# Oracle ground truth - ONLY possible because this is synthetic data with
# full labels. Used to VALIDATE the DR estimator, not as something a real
# deployment could compute.
# ---------------------------------------------------------------
true_reward_target = np.where(
    feat["target_action"].values == 1,
    reward_if_flagged(feat["is_abuse_ring"].values, feat["loss_rs"].values),
    0.0
)
V_true = true_reward_target.mean()

# Also compute the value of the baseline (behavior) policy itself, both by
# oracle and by DR, as a sanity-check reference point.
baseline_hard_action = (feat["max_amount"].values > AMOUNT_THRESHOLD).astype(int)
true_reward_baseline = np.where(
    baseline_hard_action == 1,
    reward_if_flagged(feat["is_abuse_ring"].values, feat["loss_rs"].values),
    0.0
)
V_true_baseline = true_reward_baseline.mean()

print("=== Off-policy evaluation of discovered policy v1, using ONLY logged (partial) data ===")
print(f"n = {len(feat)}, logged flag rate = {feat['logged_action'].mean():.1%}, "
      f"target policy flag rate = {feat['target_action'].mean():.1%}")
print()
print(f"Direct Method (DM) estimate:     ₹{V_dm:,.2f} per customer")
print(f"IPS-only estimate:                ₹{V_ips:,.2f} per customer")
print(f"Doubly-Robust (DR) estimate:      ₹{V_dr:,.2f} per customer   <-- the one we trust")
print()
print(f"Oracle ground truth (target v1):  ₹{V_true:,.2f} per customer   <-- only knowable because this is synthetic data")
print(f"Oracle ground truth (baseline):   ₹{V_true_baseline:,.2f} per customer")
print()
dr_error = abs(V_dr - V_true)
dm_error = abs(V_dm - V_true)
ips_error = abs(V_ips - V_true)
print(f"DR estimator error vs oracle:  ₹{dr_error:,.2f}  ({dr_error/abs(V_true)*100:.1f}% relative)")
print(f"DM estimator error vs oracle:  ₹{dm_error:,.2f}  ({dm_error/abs(V_true)*100:.1f}% relative)")
print(f"IPS estimator error vs oracle: ₹{ips_error:,.2f}  ({ips_error/abs(V_true)*100:.1f}% relative)")

# bootstrap confidence interval for the DR estimate (real-world usable,
# doesn't need the oracle)
n_boot = 1000
boot_estimates = np.zeros(n_boot)
idx_all = np.arange(len(feat))
for b in range(n_boot):
    idx = rng.choice(idx_all, size=len(idx_all), replace=True)
    boot_estimates[b] = dr_per_customer[idx].mean()
ci_low, ci_high = np.percentile(boot_estimates, [2.5, 97.5])
print(f"\nDR estimate 95% bootstrap CI: [₹{ci_low:,.2f}, ₹{ci_high:,.2f}]")

result = {
    "n_customers": int(len(feat)),
    "logged_flag_rate": float(feat["logged_action"].mean()),
    "target_flag_rate": float(feat["target_action"].mean()),
    "V_dm": float(V_dm), "V_ips": float(V_ips), "V_dr": float(V_dr),
    "V_true_oracle_target": float(V_true), "V_true_oracle_baseline": float(V_true_baseline),
    "dr_error_vs_oracle": float(dr_error), "dm_error_vs_oracle": float(dm_error), "ips_error_vs_oracle": float(ips_error),
    "dr_error_pct": float(dr_error/abs(V_true)*100), "dm_error_pct": float(dm_error/abs(V_true)*100), "ips_error_pct": float(ips_error/abs(V_true)*100),
    "dr_ci_low": float(ci_low), "dr_ci_high": float(ci_high),
    "amount_threshold": AMOUNT_THRESHOLD, "logistic_scale": LOGISTIC_SCALE, "fp_cost": FP_COST,
}
with open("data/off_policy_eval_results.json", "w") as f:
    json.dump(result, f, indent=2)
print("\nSaved: data/off_policy_eval_results.json")
