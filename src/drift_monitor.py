"""
Risk Autopsy - live drift monitor.

WHY THIS EXISTS: every evaluation stage elsewhere in this pipeline (held-out
test, adversarial test, co-evolution) is a snapshot taken AT deployment
time. A real risk team's next question is "is the policy we approved still
working, six months from now?" - abuse rings adapt continuously, not just
once at approval time.

A REAL, PREVIOUSLY-UNKNOWN GAP FOUND WHILE BUILDING THIS (not a scripted
demo prop): src/coevolution.py reports its final policy converged with
ZERO evasions found across 500 candidates per generation, within the known
abuse archetype - a "fully robust" certificate. Reading that policy's
actual learned rule directly (export_text on data/discovered_policy_final.joblib):

    max_amount > Rs 7,964  AND  time_to_escalation > 7 days  ->  flag

...against coevolution.py's own attacker sampling bounds
(`time_to_escalation = rng.integers(10, 30, n)` - NEVER below 10) shows
every single candidate the arms race ever generated had time_to_escalation
>= 10, comfortably inside the "flag" region above the real >7-day boundary.
The "zero evasions, fully converged" result is real and honestly earned for
the space that was actually searched - but that space never included a ring
that strikes FASTER than 10 days. A ring that escalates within a week
sails through untouched, regardless of amount, device/address sharing, or
every other feature - none of it matters once the time_to_escalation gate
opens at 7 days.

This script does NOT retroactively rewrite coevolution.py's results (that
would erase real evidence for the space it did test) - it demonstrates the
gap that exists OUTSIDE the tested envelope, as an ongoing monitor a real
deployment would need: simulate new monthly cohorts of abuse rings
gradually adapting toward a faster strike time (a free, zero-cost evasion
for an attacker - waiting less doesn't reduce the amount extracted) and
track the deployed (frozen, never retrained here) policy's real recall on
each new cohort.

RECOMMENDED NEXT ACTION (stated, not silently done here): widen
coevolution.py's attacker `time_to_escalation` sampling range to include
values below 10 (ideally down to 1) and rerun the arms race. This monitor's
finding is the evidence that range was too narrow - fixing it belongs in
that file, with its own new convergence result, not silently patched here.

Output: data/drift_monitor_results.json - a month-by-month recall/precision
trace plus the alert month (if any) and the root-cause finding above.
"""
import numpy as np
import pandas as pd
import joblib
import json
from sklearn.metrics import precision_score, recall_score

rng = np.random.default_rng(99)

X_cols = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]

N_MONTHS = 12
N_NORMAL_PER_MONTH = 220
N_ABUSE_PER_MONTH = 20  # 5 rings of 4, same cluster size as generate_data.py
ALERT_RECALL_FLOOR = 0.5  # a policy that tested at 100% recall dropping below 50% on live traffic is a real, actionable alert - not noise


def wait_range_for_month(month: int) -> tuple[float, float]:
    """Strike-wait window (days between the low-value and escalated
    purchase) drifts from the original archetype's 17-24 days (month 1,
    matching src/generate_data.py exactly) down to a fast-strike 2-6 days
    by month 12 - simulating rings adapting toward the untested region
    identified above. This is the ONLY thing that changes month over
    month; amounts, sharing, and every other behavior stay within the same
    archetype the rest of this pipeline already validated against."""
    frac = (month - 1) / (N_MONTHS - 1)
    lo = 17 - frac * 15   # 17 -> 2
    hi = 24 - frac * 18   # 24 -> 6
    return max(1.0, lo), max(2.0, hi)


def gen_cohort(month: int, rng: np.random.Generator) -> pd.DataFrame:
    """One month's new customer cohort, same behavioral archetype as
    src/generate_data.py. Duplicated here rather than imported - that file
    is a top-level script that writes data/*.csv on import, the same
    self-contained-by-necessity pattern already used in
    backend/policy_history.py (see its own comment on why its split logic
    is duplicated, not imported)."""
    rows = []
    for i in range(N_NORMAL_PER_MONTH):
        account_created_day = int(rng.integers(0, 60))
        n_purchases = int(rng.poisson(3)) + 1
        purchases = []
        day = account_created_day
        for _ in range(n_purchases):
            day += int(rng.integers(3, 25))
            amount = float(np.clip(rng.lognormal(mean=7.2, sigma=0.5), 200, 24000))
            purchases.append((day, amount))
        if purchases:
            max_day, max_amt = max(purchases, key=lambda p: p[1])
            min_amt = min(p[1] for p in purchases)
            first_day = purchases[0][0]
            n_before = sum(1 for d, _ in purchases if d < max_day) + 1
            escalation_ratio = max_amt / min_amt if min_amt > 0 else 1.0
            time_to_escalation = max_day - first_day
            account_age = max_day - account_created_day
        else:
            max_amt, escalation_ratio, time_to_escalation, account_age, n_before = 0.0, 1.0, -1, -1, 0
        rows.append({
            "customer_id": f"m{month}_n{i}", "is_abuse_ring": 0,
            "n_purchases_before_max": n_before, "max_amount": max_amt,
            "escalation_ratio": escalation_ratio, "time_to_escalation": time_to_escalation,
            "account_age_at_escalation": account_age,
            "device_sharing": 0, "address_sharing": 0, "loss_rs": 0.0,
        })

    wait_lo, wait_hi = wait_range_for_month(month)
    for r in range(N_ABUSE_PER_MONTH // 4):
        for k in range(4):
            low_amount = float(np.clip(rng.normal(1000, 250), 300, 2500))
            wait = int(rng.integers(int(wait_lo), int(wait_hi) + 1))
            mid_amount = float(np.clip(rng.normal(20000, 6000), 8000, 55000))
            account_created_day = int(rng.integers(0, 40))
            day1 = account_created_day + int(rng.integers(3, 10))
            day2 = day1 + wait
            rows.append({
                "customer_id": f"m{month}_a{r}_{k}", "is_abuse_ring": 1,
                "n_purchases_before_max": 2, "max_amount": mid_amount,
                "escalation_ratio": mid_amount / low_amount, "time_to_escalation": wait,
                "account_age_at_escalation": day2 - account_created_day,
                "device_sharing": 3, "address_sharing": 3, "loss_rs": mid_amount,
            })
    return pd.DataFrame(rows)


def run() -> dict:
    tree = joblib.load("data/discovered_policy_final.joblib")
    months = []
    alert_month = None

    for month in range(1, N_MONTHS + 1):
        cohort = gen_cohort(month, rng)
        pred = tree.predict(cohort[X_cols])
        precision = precision_score(cohort.is_abuse_ring, pred, zero_division=0)
        recall = recall_score(cohort.is_abuse_ring, pred, zero_division=0)
        fp = int(((pred == 1) & (cohort.is_abuse_ring == 0)).sum())
        loss_total = cohort.loss_rs.sum()
        loss_missed = cohort.loc[(pred == 0) & (cohort.is_abuse_ring == 1), "loss_rs"].sum()
        wait_lo, wait_hi = wait_range_for_month(month)

        months.append({
            "month": month, "precision": float(precision), "recall": float(recall), "fp": fp,
            "loss_total": float(loss_total), "loss_missed": float(loss_missed),
            "typical_strike_wait_days": [round(wait_lo, 1), round(wait_hi, 1)],
        })
        if alert_month is None and recall < ALERT_RECALL_FLOOR:
            alert_month = month
        print(f"Month {month:2d}  strike-wait {wait_lo:.0f}-{wait_hi:.0f}d  "
              f"recall={recall:.1%}  precision={precision:.1%}  fp={fp}  loss missed=Rs {loss_missed:,.0f}")

    result = {
        "months": months,
        "alert_recall_floor": ALERT_RECALL_FLOOR,
        "alert_month": alert_month,
        "root_cause": (
            "The deployed policy's real decision rule is 'max_amount > Rs 7,964 AND "
            "time_to_escalation > 7 days'. src/coevolution.py's own attacker search "
            "sampled time_to_escalation only from 10-30 days, never below 10 - so the "
            "zero-evasions-found, fully-converged certificate never actually tested a "
            "fast-strike ring. This monitor simulates rings gradually adapting toward a "
            "faster strike time and shows recall collapsing once real-world behavior "
            "moves outside the envelope that was actually tested."
        ),
        "recommended_action": (
            "Widen coevolution.py's attacker time_to_escalation sampling range to include "
            "values below 10 (ideally down to 1) and rerun the arms race - this monitor's "
            "finding is the evidence that range was too narrow. Not done automatically here "
            "so the existing, honestly-earned convergence result for the tested envelope is "
            "not silently overwritten."
        ),
    }
    if alert_month:
        print(f"\n*** DRIFT ALERT: recall fell below {ALERT_RECALL_FLOOR:.0%} at month {alert_month} "
              f"(strike-wait window {months[alert_month - 1]['typical_strike_wait_days']} days) ***")
    else:
        print("\nNo drift alert triggered across the simulated window.")
    return result


if __name__ == "__main__":
    result = run()
    with open("data/drift_monitor_results.json", "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/drift_monitor_results.json")
