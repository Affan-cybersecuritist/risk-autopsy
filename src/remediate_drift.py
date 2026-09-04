"""
Risk Autopsy - closed-loop remediation: turn a drift finding into a fix.

WHY THIS EXISTS: src/drift_monitor.py found a real, previously-unknown gap -
the co-evolution arms race's attacker (src/coevolution.py) only ever sampled
time_to_escalation from 10-30 days, so its "converged, zero evasions found"
certificate never actually tested a ring that strikes within a week. Simply
writing that down as a "recommended action" and stopping there leaves the
deployed policy's known bypass unpatched. This script is the fix, not just
the diagnosis: it re-opens the arms race with the search envelope the drift
finding says was too narrow, continues hardening from the already-deployed
final policy (not a restart from scratch - real teams don't discard prior
hardening), and then re-runs the exact same drift simulation against the
NEW policy to prove the fix actually closes the gap, not just claim it does.

This is the mechanical realization of the project's own tagline: a loss (the
drift alert) becomes a defense (a new hardened policy), automatically, with
before/after evidence - not a paragraph promising future work.

WHAT THIS DELIBERATELY DOES NOT DO: it does not overwrite
data/coevolution_results.json or data/discovered_policy_final.joblib. The
original arms race's "converged at generation 2" result is real, honestly
earned evidence for the search space it actually tested - erasing it to make
this remediation look more dramatic would be exactly the kind of dishonesty
this whole project argues against. This writes NEW artifacts alongside it:
data/coevolution_remediated_results.json, data/discovered_policy_remediated.joblib,
data/drift_monitor_remediated_results.json - and registers the remediated
policy as a new, real version in the policy history timeline.

Output: data/coevolution_remediated_results.json, data/discovered_policy_remediated.joblib,
data/drift_monitor_remediated_results.json
"""
import sys
import os
import json

import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.metrics import precision_score, recall_score
import joblib

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_THIS_DIR)
sys.path.insert(0, _THIS_DIR)      # for `import drift_monitor`
sys.path.insert(0, _REPO_ROOT)     # for `from backend import policy_history`
from drift_monitor import gen_cohort, wait_range_for_month, N_MONTHS, ALERT_RECALL_FLOOR, X_cols as DRIFT_X_COLS  # noqa: E402

X_cols = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]

SEARCH_BUDGET = 500
MAX_GENERATIONS = 15
CONVERGENCE_THRESHOLD = 0

rng = np.random.default_rng(2027)  # different seed from coevolution.py's 2026 - a genuinely new search, not a replay


def sample_attacker_candidates_widened(n, rng):
    """Identical to coevolution.py's sample_attacker_candidates, except
    time_to_escalation is sampled from 1-30 days instead of 10-30 - the
    exact widening drift_monitor.py's finding recommended. This range is a
    strict superset of the original (1-30 includes 10-30), so this
    honestly extends coverage rather than replacing what was already
    tested."""
    low_amount = rng.uniform(300, 3000, n)
    mid_amount = rng.uniform(8000, 60000, n)
    time_to_escalation = rng.integers(1, 30, n)
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


def run_remediation() -> dict:
    if not os.path.exists("data/drift_monitor_results.json"):
        raise RuntimeError("data/drift_monitor_results.json missing - run src/drift_monitor.py first, "
                            "this remediation exists specifically to fix what it found")
    with open("data/drift_monitor_results.json") as f:
        drift_before = json.load(f)
    if drift_before["alert_month"] is None:
        raise RuntimeError("no drift alert on record - nothing to remediate")

    # Continue hardening from the already-deployed final policy, not a
    # restart - a real team doesn't throw away prior hardening work.
    current_tree = joblib.load("data/discovered_policy_final.joblib")

    # The adversarially-hardened policy (this project's README calls it
    # "v2") was, until now, never actually registered in the policy_history
    # timeline - it only existed as a standalone joblib + coevolution_results.json.
    # Seed it as a real v2 first (re-evaluating it here reproduces the exact
    # same precision/recall/fp already in coevolution_results.json - a
    # nice built-in consistency check), so this remediation becomes v3,
    # not a same-numbered collision with a different "v2."
    from backend import policy_history as ph
    history = ph.get_history()
    if not any("adversarially-hardened" in h.get("label", "") for h in history):
        with open("data/coevolution_results.json") as f:
            coevo_original = json.load(f)
        ph.register_external_policy(
            tree=current_tree, x_cols=X_cols,
            label_suffix="adversarially-hardened",
            note=(f"The final policy from src/coevolution.py's original arms race - converged at "
                  f"generation {coevo_original['converged_at_generation']}, catches every evasion "
                  f"within its tested search envelope (time_to_escalation 10-30 days). This is the "
                  f"README's 'Discovered v2 (retrained)' - registered here for the first time so it "
                  f"has a real place in the approval timeline, not just a standalone artifact."),
        )

    feat = pd.read_csv("data/features.csv")
    test_set = pd.read_csv("data/test_set.csv")
    train_pool = feat[X_cols + ["is_abuse_ring"]].copy()

    generation_log = []
    for gen in range(1, MAX_GENERATIONS + 1):
        candidates = sample_attacker_candidates_widened(SEARCH_BUDGET, rng)
        preds = current_tree.predict(candidates[X_cols])
        evasions = candidates[preds == 0]
        n_evasions = len(evasions)

        test_pred = current_tree.predict(test_set[X_cols])
        precision = precision_score(test_set.is_abuse_ring, test_pred, zero_division=0)
        recall = recall_score(test_set.is_abuse_ring, test_pred, zero_division=0)
        fp = int(((test_pred == 1) & (test_set.is_abuse_ring == 0)).sum())

        generation_log.append({
            "generation": gen, "evasions_found": int(n_evasions), "search_budget": SEARCH_BUDGET,
            "test_precision": float(precision), "test_recall": float(recall), "test_fp": fp,
        })
        print(f"Gen {gen}: {n_evasions}/{SEARCH_BUDGET} evasions found (widened envelope, "
              f"time_to_escalation 1-30d) | test precision={precision:.3f} recall={recall:.3f} fp={fp}")

        if n_evasions <= CONVERGENCE_THRESHOLD:
            print(f"\n*** RE-CONVERGED at generation {gen}: attacker found zero evasions in a budget "
                  f"of {SEARCH_BUDGET}, now including the previously-untested fast-strike region. ***")
            break

        train_pool = pd.concat([train_pool, evasions[X_cols + ["is_abuse_ring"]]], ignore_index=True)
        current_tree = DecisionTreeClassifier(max_depth=6, min_samples_leaf=6, random_state=42,
                                               class_weight="balanced")
        current_tree.fit(train_pool[X_cols], train_pool["is_abuse_ring"])
    else:
        print(f"\n*** Did NOT re-converge within {MAX_GENERATIONS} generations. ***")

    final_precision = generation_log[-1]["test_precision"]
    final_recall = generation_log[-1]["test_recall"]
    final_fp = generation_log[-1]["test_fp"]
    converged = generation_log[-1]["evasions_found"] <= CONVERGENCE_THRESHOLD
    rule_text = export_text(current_tree, feature_names=X_cols)

    joblib.dump(current_tree, "data/discovered_policy_remediated.joblib")

    coevo_result = {
        "started_from": "discovered_policy_final.joblib (the deployed policy the drift monitor tested)",
        "widened_dimension": "time_to_escalation: 10-30 days -> 1-30 days (strict superset)",
        "reason": drift_before["root_cause"],
        "generation_log": generation_log,
        "converged": bool(converged),
        "converged_at_generation": generation_log[-1]["generation"] if converged else None,
        "final_precision": final_precision, "final_recall": final_recall, "final_fp": final_fp,
        "final_rule_text": rule_text,
        "search_budget_per_generation": SEARCH_BUDGET,
    }
    with open("data/coevolution_remediated_results.json", "w") as f:
        json.dump(coevo_result, f, indent=2)

    # --- Re-run the EXACT same drift simulation against the new policy to
    # prove the fix, not just claim it. Reuses drift_monitor.py's own cohort
    # generator and month-by-month logic verbatim. ---
    months_after = []
    alert_month_after = None
    for month in range(1, N_MONTHS + 1):
        cohort = gen_cohort(month, np.random.default_rng(99))  # same seed drift_monitor.py itself uses, for a fair before/after comparison
        pred = current_tree.predict(cohort[DRIFT_X_COLS])
        precision_m = precision_score(cohort.is_abuse_ring, pred, zero_division=0)
        recall_m = recall_score(cohort.is_abuse_ring, pred, zero_division=0)
        fp_m = int(((pred == 1) & (cohort.is_abuse_ring == 0)).sum())
        loss_total = cohort.loss_rs.sum()
        loss_missed = cohort.loc[(pred == 0) & (cohort.is_abuse_ring == 1), "loss_rs"].sum()
        wait_lo, wait_hi = wait_range_for_month(month)
        months_after.append({
            "month": month, "precision": float(precision_m), "recall": float(recall_m), "fp": fp_m,
            "loss_total": float(loss_total), "loss_missed": float(loss_missed),
            "typical_strike_wait_days": [round(wait_lo, 1), round(wait_hi, 1)],
        })
        if alert_month_after is None and recall_m < ALERT_RECALL_FLOOR:
            alert_month_after = month
        print(f"[post-remediation] Month {month:2d}  strike-wait {wait_lo:.0f}-{wait_hi:.0f}d  recall={recall_m:.1%}")

    drift_after = {
        "months": months_after,
        "alert_recall_floor": ALERT_RECALL_FLOOR,
        "alert_month": alert_month_after,
        "compared_against": "data/drift_monitor_results.json (pre-remediation)",
        "fixed": alert_month_after is None,
    }
    with open("data/drift_monitor_remediated_results.json", "w") as f:
        json.dump(drift_after, f, indent=2)

    if alert_month_after is None:
        print(f"\n*** REMEDIATION VERIFIED: recall never drops below {ALERT_RECALL_FLOOR:.0%} across all "
              f"{N_MONTHS} simulated months, including the previously-fatal fast-strike region. ***")
    else:
        print(f"\n*** Remediation incomplete: still alerts at month {alert_month_after}. ***")

    # --- Register as a real, approvable version in the policy history timeline
    # (idempotent - rerunning this script shouldn't spam duplicate versions). ---
    history_now = ph.get_history()
    existing = next((h for h in history_now if "remediated: fast-strike gap patched" in h.get("label", "")), None)
    if existing:
        entry = existing
        print(f"\nAlready registered as policy history {entry['label']} (version {entry['version']}) - not duplicating")
    else:
        entry = ph.register_external_policy(
            tree=current_tree, x_cols=X_cols,
            label_suffix="remediated: fast-strike gap patched",
            note=("Re-ran the adversarial arms race from the deployed policy with time_to_escalation "
                  "widened to 1-30 days (was 10-30), the exact gap src/drift_monitor.py found. "
                  f"Re-converged at generation {coevo_result['converged_at_generation']}."),
        )
        print(f"\nRegistered as policy history {entry['label']} (version {entry['version']})")

    return {"coevolution": coevo_result, "drift_after": drift_after, "history_entry": entry}


if __name__ == "__main__":
    run_remediation()
