"""
Risk Autopsy - policy portfolio conflict / fairness check.

WHY THIS EXISTS: previously named as unbuilt roadmap. Built now.

THE QUESTION THIS ANSWERS: a new fraud rule can have excellent aggregate
precision/recall and still be a bad rule to ship, if it silently punishes
one customer segment far more than others - e.g. flagging new accounts, or
customers in one geography/ticket-size band, at a much higher false-positive
rate than the rest of the population. Aggregate metrics hide this. This
script breaks the false-positive rate down by segment and flags any segment
where the new policy's FP rate is a statistical outlier vs. the rest.

METHOD: for each customer segment (account-age band, purchase-size band),
compute the false-positive rate under the discovered policy vs. under the
baseline, and flag segments where the new policy's FP rate exceeds the
population-average FP rate by more than a set multiple (a simple, auditable
rule - not a black-box fairness metric that would itself need defending).
"""
import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier
import joblib
import json

X_cols = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]

feat = pd.read_csv("data/features.csv")
tree = joblib.load("data/discovered_policy.joblib")
feat["pred"] = tree.predict(feat[X_cols])
feat["baseline_pred"] = (feat["max_amount"] > 25000).astype(int)

# ---------------------------------------------------------------
# Segment definitions - simple, interpretable bands (not learned clusters,
# so a compliance reviewer can understand exactly what's being checked)
# ---------------------------------------------------------------
feat["account_age_band"] = pd.cut(
    feat["account_age_at_escalation"].clip(lower=0),
    bins=[-1, 10, 20, 30, 1e9], labels=["0-10d", "11-20d", "21-30d", "30d+"]
)
feat["amount_band"] = pd.cut(
    feat["max_amount"],
    bins=[-1, 5000, 15000, 25000, 40000, 1e9],
    labels=["0-5k", "5-15k", "15-25k", "25-40k", "40k+"]
)

def fp_rate(df, pred_col):
    normal = df[df.is_abuse_ring == 0]
    if len(normal) == 0:
        return np.nan, 0
    return (normal[pred_col] == 1).mean(), len(normal)

overall_fp_rate, overall_n = fp_rate(feat, "pred")
overall_baseline_fp, _ = fp_rate(feat, "baseline_pred")

FLAG_MULTIPLIER = 2.5  # a segment's FP rate more than this multiple of the population average gets flagged
MIN_SEGMENT_SIZE = 15  # ignore segments too small to be statistically meaningful

results = []
for seg_type, col in [("account_age_band", "account_age_band"), ("amount_band", "amount_band")]:
    for seg_val in feat[col].dropna().unique():
        seg = feat[feat[col] == seg_val]
        seg_fp, seg_n_normal = fp_rate(seg, "pred")
        seg_fp_baseline, _ = fp_rate(seg, "baseline_pred")
        if seg_n_normal < MIN_SEGMENT_SIZE or np.isnan(seg_fp):
            continue
        ratio = seg_fp / overall_fp_rate if overall_fp_rate > 0 else (float('inf') if seg_fp > 0 else 1.0)
        flagged = ratio > FLAG_MULTIPLIER
        results.append({
            "segment_type": seg_type, "segment_value": str(seg_val),
            "n_normal_customers": int(seg_n_normal),
            "fp_rate_new_policy": float(seg_fp), "fp_rate_baseline": float(seg_fp_baseline),
            "fp_rate_vs_population_ratio": float(ratio) if np.isfinite(ratio) else None,
            "flagged_as_outlier": bool(flagged),
        })

results_df = pd.DataFrame(results).sort_values("fp_rate_vs_population_ratio", ascending=False, na_position="last")

print(f"=== Portfolio conflict check ===")
print(f"Population-wide false-positive rate (new policy): {overall_fp_rate:.2%}  (n={overall_n} normal customers)")
print(f"Population-wide false-positive rate (baseline):    {overall_baseline_fp:.2%}")
print(f"\nFlagging threshold: segment FP rate > {FLAG_MULTIPLIER}x population average, min segment size {MIN_SEGMENT_SIZE}\n")
print(results_df.to_string(index=False))

n_flagged = int(results_df["flagged_as_outlier"].sum())
print(f"\n{n_flagged} segment(s) flagged as outliers." if n_flagged else "\nNo segments flagged - false-positive burden is evenly distributed.")

output = {
    "overall_fp_rate_new_policy": float(overall_fp_rate),
    "overall_fp_rate_baseline": float(overall_baseline_fp),
    "flag_multiplier": FLAG_MULTIPLIER, "min_segment_size": MIN_SEGMENT_SIZE,
    "n_segments_flagged": n_flagged,
    "segments": results_df.to_dict(orient="records"),
}
with open("data/portfolio_conflict_results.json", "w") as f:
    json.dump(output, f, indent=2, default=str)
print("\nSaved: data/portfolio_conflict_results.json")
