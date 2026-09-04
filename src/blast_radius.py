"""
Risk Autopsy - policy blast radius.

Every other stage in this pipeline reports AGGREGATES (precision, recall,
FP rate by segment). None of them answer the question a real reviewer
actually asks before approving a policy change: "which specific accounts
does this flip, and are any of those flips going to embarrass me?"

This is a per-customer diff of baseline vs. discovered policy on the same
held-out test set already produced by features_and_policy.py - literally
`git diff` for a risk policy, ranked by dollar impact, not just a metrics
table.
"""
import json
import joblib
import pandas as pd

AMOUNT_THRESHOLD = 25000
X_COLS = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]

test = pd.read_csv("data/test_set.csv")
tree = joblib.load("data/discovered_policy.joblib")

baseline_pred = (test["max_amount"] > AMOUNT_THRESHOLD).astype(int)
tree_pred = pd.Series(tree.predict(test[X_COLS]), index=test.index)

test["baseline_flag"] = baseline_pred
test["discovered_flag"] = tree_pred

newly_flagged = test[(test.baseline_flag == 0) & (test.discovered_flag == 1)].copy()
newly_cleared = test[(test.baseline_flag == 1) & (test.discovered_flag == 0)].copy()

def _rows(df, kind):
    out = []
    for _, r in df.iterrows():
        out.append({
            "customer_id": int(r.customer_id),
            "flip": kind,
            "is_abuse_ring": bool(r.is_abuse_ring),
            "max_amount": float(r.max_amount),
            "loss_rs": float(r.loss_rs),
            "account_age_at_escalation": float(r.account_age_at_escalation),
            "device_sharing": int(r.device_sharing),
            "address_sharing": int(r.address_sharing),
            "escalation_ratio": float(r.escalation_ratio),
        })
    return out

newly_flagged_rows = sorted(_rows(newly_flagged, "newly_flagged"), key=lambda r: -r["max_amount"])
newly_cleared_rows = sorted(_rows(newly_cleared, "newly_cleared"), key=lambda r: -r["loss_rs"])

# The genuinely interesting rows for a human reviewer: newly-flagged customers
# who are NOT abuse ring members (a legitimate customer newly caught in the
# net) and newly-cleared customers who ARE abuse ring members (a real abuser
# the new policy stops catching, if any). Everything else is the new policy
# working as intended and doesn't need a human's attention.
worth_reviewing = (
    [r for r in newly_flagged_rows if not r["is_abuse_ring"]] +
    [r for r in newly_cleared_rows if r["is_abuse_ring"]]
)

results = {
    "n_test_customers": int(len(test)),
    "n_newly_flagged": len(newly_flagged_rows),
    "n_newly_cleared": len(newly_cleared_rows),
    "newly_flagged_loss_at_stake": float(newly_flagged.loss_rs.sum()),
    "newly_cleared_loss_at_stake": float(newly_cleared.loss_rs.sum()),
    "newly_flagged": newly_flagged_rows[:25],
    "newly_cleared": newly_cleared_rows[:25],
    "worth_reviewing_count": len(worth_reviewing),
    "worth_reviewing": worth_reviewing[:15],
}

with open("data/blast_radius_results.json", "w") as f:
    json.dump(results, f, indent=2)

print(f"Newly flagged: {len(newly_flagged_rows)} (₹{newly_flagged.loss_rs.sum():,.0f} loss at stake)")
print(f"Newly cleared: {len(newly_cleared_rows)} (₹{newly_cleared.loss_rs.sum():,.0f} loss at stake)")
print(f"Worth a human's attention: {len(worth_reviewing)}")
print("Saved: data/blast_radius_results.json")
