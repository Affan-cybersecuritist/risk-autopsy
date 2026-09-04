"""
Policy version history - real retraining, not a fake timeline.

A real risk team doesn't approve one policy and stop; they iterate -
tighten a threshold, retrain against new data, compare the new candidate
against what's already in production. This lets a reviewer actually do
that: retrain a genuinely different decision tree (different max_depth /
min_samples_leaf), get its real held-out metrics, and see it recorded
alongside every prior version and who approved what, when.

The train/test split logic here is intentionally identical to
src/features_and_policy.py (same seed, same ring-grouping) so retrained
candidates are evaluated on the exact same held-out set as the original
v1 policy - a fair comparison, not a different benchmark.
"""
import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.metrics import precision_score, recall_score

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
HISTORY_PATH = os.path.join(DATA, "policy_history.json")

X_COLS = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]
FP_COST_PER_CASE = 150


def _load_split():
    customers = pd.read_csv(os.path.join(DATA, "customers.csv"))
    txns = pd.read_csv(os.path.join(DATA, "transactions.csv"))
    feat = pd.read_csv(os.path.join(DATA, "features.csv"))

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


def _read_history() -> list[dict]:
    if not os.path.exists(HISTORY_PATH):
        return []
    with open(HISTORY_PATH) as f:
        return json.load(f)


def _write_history(history: list[dict]):
    with open(HISTORY_PATH, "w") as f:
        json.dump(history, f, indent=2)


def get_history() -> list[dict]:
    history = _read_history()
    if not history:
        # Seed with the original v1 policy from results.json so the
        # timeline starts from something real, not empty.
        results_path = os.path.join(DATA, "results.json")
        if os.path.exists(results_path):
            with open(results_path) as f:
                r = json.load(f)
            history = [{
                "version": 1,
                "label": "v1 (original discovered policy)",
                "created_at": None,
                "hyperparams": {"max_depth": 4, "min_samples_leaf": 10},
                "precision": r["discovered"]["precision"], "recall": r["discovered"]["recall"],
                "fp": r["discovered"]["fp"], "fp_cost": r["discovered"]["fp_cost"],
                "loss_prevented": r["discovered"]["loss_prevented"], "total_test_loss": r["total_test_loss"],
                "rule_text": r["rule_text"], "approved_by": None, "approved_at": None,
                "gates": [], "gates_note": "not computed for this legacy version, seeded before the gate-checklist feature existed",
            }]
            _write_history(history)
    for h in history:
        h.setdefault("gates", [])
    return history


def annotate_deployment_status(history: list[dict]) -> list[dict]:
    """Real financial-risk systems distinguish ACTIVE (the policy actually
    making decisions right now) from PROPOSED (evaluated, maybe even
    approved, but not yet live) - conflating the two is exactly how a
    remediation or an autonomous-engineer run could silently 'deploy' by
    just existing in the timeline. This project has no separate deploy
    step to wire up (there's no live transaction stream to deploy INTO -
    see the README's data-honesty section), so ACTIVE is defined the only
    honest way it can be here: the highest-versioned entry a human has
    actually approved. Everything newer is PROPOSED, no matter how good
    its readiness score is. Everything older that was once approved but
    has since been superseded by a newer approval is SUPERSEDED - it was
    real, it just isn't the current decision-maker anymore.

    If NOTHING has been approved yet (true for a fresh clone, and true in
    this repo's own committed state right now), there is no active policy
    at all - every version, including v1, is PROPOSED. That's the honest
    answer, not a fabricated 'v1 is active by default.'"""
    approved_versions = [h["version"] for h in history if h.get("approved_by")]
    active_version = max(approved_versions) if approved_versions else None

    annotated = []
    for h in history:
        entry = dict(h)
        if active_version is not None and entry["version"] == active_version:
            status = "ACTIVE"
        elif entry.get("approved_by") and active_version is not None and entry["version"] < active_version:
            status = "SUPERSEDED"
        else:
            status = "PROPOSED"
        entry["deployment_status"] = status
        annotated.append(entry)
    return annotated


def get_active_version(history: list[dict] | None = None) -> dict | None:
    history = history if history is not None else get_history()
    approved = [h for h in history if h.get("approved_by")]
    if not approved:
        return None
    return max(approved, key=lambda h: h["version"])


def retrain(max_depth: int, min_samples_leaf: int) -> dict:
    if not (1 <= max_depth <= 10):
        raise ValueError("max_depth must be between 1 and 10")
    if not (2 <= min_samples_leaf <= 200):
        raise ValueError("min_samples_leaf must be between 2 and 200")

    feat_train, feat_test = _load_split()
    X_train, y_train = feat_train[X_COLS], feat_train["is_abuse_ring"]
    X_test, y_test = feat_test[X_COLS], feat_test["is_abuse_ring"]

    tree = DecisionTreeClassifier(max_depth=max_depth, min_samples_leaf=min_samples_leaf,
                                   random_state=42, class_weight="balanced")
    tree.fit(X_train, y_train)
    pred = tree.predict(X_test)

    precision = precision_score(y_test, pred, zero_division=0)
    recall = recall_score(y_test, pred, zero_division=0)
    loss_prevented = feat_test.loc[pred == 1, "loss_rs"].sum()
    fp = int(((pred == 1) & (y_test == 0)).sum())
    total_test_loss = feat_test["loss_rs"].sum()

    history = get_history()
    version = max(h["version"] for h in history) + 1
    entry = {
        "version": version,
        "label": f"v{version} (retrained: depth={max_depth}, min_leaf={min_samples_leaf})",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "hyperparams": {"max_depth": max_depth, "min_samples_leaf": min_samples_leaf},
        "precision": float(precision), "recall": float(recall),
        "fp": fp, "fp_cost": float(fp * FP_COST_PER_CASE),
        "loss_prevented": float(loss_prevented), "total_test_loss": float(total_test_loss),
        "rule_text": export_text(tree, feature_names=X_COLS),
        "approved_by": None, "approved_at": None,
        "gates": _compute_gates(tree, X_COLS),
    }
    history.append(entry)
    _write_history(history)
    return entry


def _compute_gates(tree, x_cols: list[str]) -> list[dict]:
    """Local import to avoid a circular import (backend/agent.py imports
    this module for its own registration path) - every policy version,
    however it was created, gets the exact same real gate checklist via
    agent.py's compute_gates_for_tree, which is the single shared home for
    gate computation (regression/adversarial/fairness/off-policy/evasion-
    distance/economic-value/complexity)."""
    from . import agent as agent_mod
    try:
        return agent_mod.compute_gates_for_tree(tree, x_cols)
    except Exception as e:
        # A gate-computation failure must not block registering a real,
        # already-evaluated policy version - visible as an empty gates
        # list plus a note, never silently dropped or fatal.
        return [{"name": "Gate computation", "detail": f"failed: {e}", "passed": False, "threshold": "gates must compute successfully"}]


def register_external_policy(tree, x_cols: list[str], label_suffix: str, note: str) -> dict:
    """Register an already-fitted policy (not one retrain() itself trained)
    as a new, real version in the timeline - evaluated on the exact same
    held-out split as every other version, so the comparison stays fair.

    This exists for src/remediate_drift.py: a policy produced by re-running
    the adversarial arms race with a widened search envelope is a
    genuinely new candidate, and belongs in the same approvable timeline
    as a hyperparameter retrain, not a separate, disconnected artifact."""
    feat_train, feat_test = _load_split()
    X_test, y_test = feat_test[x_cols], feat_test["is_abuse_ring"]
    pred = tree.predict(X_test)

    precision = precision_score(y_test, pred, zero_division=0)
    recall = recall_score(y_test, pred, zero_division=0)
    loss_prevented = feat_test.loc[pred == 1, "loss_rs"].sum()
    fp = int(((pred == 1) & (y_test == 0)).sum())
    total_test_loss = feat_test["loss_rs"].sum()

    history = get_history()
    version = max(h["version"] for h in history) + 1
    params = tree.get_params()
    entry = {
        "version": version,
        "label": f"v{version} ({label_suffix})",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "hyperparams": {"max_depth": params.get("max_depth"), "min_samples_leaf": params.get("min_samples_leaf")},
        "precision": float(precision), "recall": float(recall),
        "fp": fp, "fp_cost": float(fp * FP_COST_PER_CASE),
        "loss_prevented": float(loss_prevented), "total_test_loss": float(total_test_loss),
        "rule_text": export_text(tree, feature_names=x_cols),
        "approved_by": None, "approved_at": None,
        "note": note,
        "gates": _compute_gates(tree, x_cols),
    }
    history.append(entry)
    _write_history(history)
    return entry


def approve_version(version: int, approved_by: str) -> dict:
    history = get_history()
    for h in history:
        if h["version"] == version:
            h["approved_by"] = approved_by
            h["approved_at"] = datetime.now(timezone.utc).isoformat()
            _write_history(history)
            return h
    raise ValueError(f"no policy version {version} in history")
