"""
Risk Autopsy - shared leakage-free feature engineering.

Extracted out of features_and_policy.py so every script that needs to turn
a (customers, transactions) population into the same 7 pre-decision
features - features_and_policy.py itself, and the harder-data evaluation
scripts (difficulty_tiers_eval.py, secret_holdout_eval.py,
multi_seed_eval.py) that generate FRESH populations rather than reading the
committed data/features.csv - use the exact same formula. One formula set,
used everywhere, the same discipline backend/agent.py's engineered
features already hold themselves to.

IMPORTANT: features here are restricted to information available AT THE
MOMENT of the escalated (high-value) purchase - i.e. what you'd know if you
were deciding whether to step-up-verify or flag this transaction BEFORE any
return/chargeback happens. See features_and_policy.py's module docstring
for the full history of why (temporal leakage bug, now fixed).
"""
import pandas as pd

X_COLS = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]


def build_features(customers: pd.DataFrame, txns: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for _, cust in customers.iterrows():
        cid = cust.customer_id
        ct = txns[txns.customer_id == cid].sort_values("day")
        purchases = ct[ct.txn_type == "purchase"]

        n_purchases_before_max = 0
        max_amount = purchases.amount.max() if len(purchases) else 0
        min_amount = purchases.amount.min() if len(purchases) else 0
        escalation_ratio = (max_amount / min_amount) if (len(purchases) >= 2 and min_amount > 0) else 1.0

        if len(purchases) >= 1:
            first_day = purchases.iloc[0].day
            max_day = purchases.loc[purchases.amount.idxmax()].day
            n_purchases_before_max = (purchases.day < max_day).sum() + 1
            time_to_escalation = max_day - first_day
            account_age_at_escalation = max_day - cust.account_created_day
        else:
            time_to_escalation = -1
            account_age_at_escalation = -1

        device_sharing = (customers.device_id == cust.device_id).sum() - 1
        address_sharing = (customers.address_id == cust.address_id).sum() - 1

        rows.append({
            "customer_id": cid, "is_abuse_ring": cust.is_abuse_ring,
            "n_purchases_before_max": n_purchases_before_max, "max_amount": max_amount,
            "escalation_ratio": escalation_ratio, "time_to_escalation": time_to_escalation,
            "account_age_at_escalation": account_age_at_escalation,
            "device_sharing": device_sharing, "address_sharing": address_sharing,
        })
    return pd.DataFrame(rows)


def ring_grouped_split(customers: pd.DataFrame, feat: pd.DataFrame, rng, test_frac: float = 0.3):
    """Same ring-grouped (by address_id) train/test split logic used
    throughout this project (features_and_policy.py, policy_history.py,
    intervention_optimizer.py) - a single shared implementation so a
    harder-tier evaluation is never accidentally compared against a
    differently-split population."""
    cust_group = customers.set_index("customer_id")["address_id"]
    feat = feat.copy()
    feat["group_id"] = feat.customer_id.map(cust_group)

    import numpy as np
    groups = np.array(feat["group_id"].unique().astype(str).tolist())
    rng.shuffle(groups)
    n_test_groups = int(len(groups) * test_frac)
    test_groups = set(groups[:n_test_groups])

    is_test = feat["group_id"].isin(test_groups)
    return feat[~is_test].copy(), feat[is_test].copy()
