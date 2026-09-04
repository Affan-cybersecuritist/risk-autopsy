"""
Risk Autopsy - Residual Behavior Scan (EXPERIMENTAL - not a discovery claim).

WHY THIS EXISTS, AND WHY IT'S CAVEATED THIS HARD: every other capability in
this project detects a KNOWN abuse typology (low-value purchase -> wait ->
high-value escalation -> chargeback, via a shared device/address ring) -
because that's literally how src/generate_data.py builds the synthetic
data. A real risk team also needs to ask "what doesn't fit ANY known
pattern?" - that's a genuinely different, valuable question. This file
illustrates the CAPABILITY (what a residual/unsupervised scan would
surface), using unsupervised clustering (KMeans) on customers the
discovered policy gets wrong or is unsure about (false negatives, false
positives, borderline predict_proba).

THE HONEST LIMIT, STATED PLAINLY: this dataset's abuse rings are generated
from ONE fixed typology with a fixed random seed. Any cluster this file
finds is a structural property of that generator's noise and edge cases
(e.g. a "family" customer who innocently shares a device, or a Weibull-
timed ring member who missed the escalation window) - NOT evidence of a
real, previously-unseen fraud pattern. There is no way for unsupervised
clustering on a closed synthetic world to discover something outside that
world's own construction. Every consumer of this output (JSON field,
dashboard section) must carry this disclaimer prominently - it is not
optional decoration.

Output: data/residual_cluster_results.json
"""
import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

X_COLS = ["n_purchases_before_max", "max_amount", "escalation_ratio", "time_to_escalation",
          "account_age_at_escalation", "device_sharing", "address_sharing"]

DISCLAIMER = (
    "This is unsupervised clustering of residual (misclassified or borderline) held-out "
    "customers from a fixed, known synthetic abuse typology. Any cluster found here is a "
    "structural property of this dataset's generator and noise, not evidence of a real, "
    "previously-unseen fraud pattern. Treat this as an illustration of the CAPABILITY (what a "
    "residual scan would surface on real data), not a discovery claim."
)

K_RANGE = range(2, 6)


def _residual_rows(tree, test_set: pd.DataFrame) -> pd.DataFrame:
    pred = tree.predict(test_set[X_COLS])
    p_abuse = tree.predict_proba(test_set[X_COLS])[:, 1] if 1 in tree.classes_ else np.zeros(len(test_set))
    misclassified = pred != test_set["is_abuse_ring"].values
    borderline = (p_abuse > 0.1) & (p_abuse < 0.9)
    residual_mask = misclassified | borderline
    return test_set[residual_mask].copy()


def run() -> dict:
    # Deliberately uses the ORIGINAL v1 policy (discovered_policy.joblib),
    # not the fully adversarially-hardened discovered_policy_final.joblib -
    # disclosed here, not hidden. The hardened policy has 0 residuals on
    # this held-out set (see src/intervention_optimizer.py's own
    # separability finding), so there is nothing to cluster there; v1's
    # real 5 false positives (see data/results.json) give this scan an
    # actual, non-empty residual population to demonstrate the mechanism
    # against - the SAME kind of honest data-driven choice this project
    # already makes elsewhere (e.g. picking a representative loss_rs for a
    # synthetic sweep) rather than pretending residuals exist where they don't.
    tree = joblib.load(os.path.join(DATA, "discovered_policy.joblib"))
    test_set = pd.read_csv(os.path.join(DATA, "test_set.csv"))

    total_loss = float(test_set["loss_rs"].sum())
    pred = tree.predict(test_set[X_COLS])
    loss_caught = float(test_set.loc[pred == 1, "loss_rs"].sum())
    pct_loss_explained = round(loss_caught / total_loss * 100, 1) if total_loss > 0 else 0.0

    residual = _residual_rows(tree, test_set)
    loss_in_residual = float(residual["loss_rs"].sum())
    pct_loss_in_residual = round(loss_in_residual / total_loss * 100, 1) if total_loss > 0 else 0.0

    if len(residual) < 4:
        return {
            "disclaimer": DISCLAIMER,
            "policy_used": "discovered_policy.joblib (v1)",
            "k_chosen": None,
            "silhouette_score": None,
            "pct_loss_explained_by_known_policy": pct_loss_explained,
            "pct_loss_in_residual_clusters": pct_loss_in_residual,
            "n_residual_customers": int(len(residual)),
            "clusters": [],
            "method": "Too few residual (misclassified/borderline) customers to cluster meaningfully "
                      f"({len(residual)} found, need >= 4).",
        }

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(residual[X_COLS])

    best_k, best_score, best_labels = None, -1.0, None
    for k in K_RANGE:
        if k >= len(residual):
            continue
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(X_scaled)
        if len(set(labels)) < 2:
            continue
        score = silhouette_score(X_scaled, labels)
        if score > best_score:
            best_k, best_score, best_labels = k, score, labels

    if best_labels is None:
        best_k, best_labels = 1, np.zeros(len(residual), dtype=int)
        best_score = 0.0

    residual = residual.assign(cluster=best_labels)
    overall_mean = residual[X_COLS].mean()
    overall_std = residual[X_COLS].std().replace(0, 1.0)

    clusters = []
    for cid in sorted(set(best_labels)):
        seg = residual[residual.cluster == cid]
        centroid = seg[X_COLS].mean()
        deviation = ((centroid - overall_mean) / overall_std).abs().sort_values(ascending=False)
        clusters.append({
            "cluster_id": int(cid),
            "size": int(len(seg)),
            "mean_loss_rs": round(float(seg["loss_rs"].mean()), 2),
            "abuse_rate": round(float(seg["is_abuse_ring"].mean()), 3),
            "centroid": {c: round(float(centroid[c]), 3) for c in X_COLS},
            "dominant_dimensions": deviation.index[:2].tolist(),
        })

    result = {
        "disclaimer": DISCLAIMER,
        "policy_used": "discovered_policy.joblib (v1, NOT the adversarially-hardened final policy - "
                       "the hardened policy has 0 residuals on this held-out set, so v1's real 5 "
                       "false positives are used instead to demonstrate the mechanism against an "
                       "actual, non-empty residual population)",
        "k_chosen": int(best_k),
        "silhouette_score": round(float(best_score), 4),
        "pct_loss_explained_by_known_policy": pct_loss_explained,
        "pct_loss_in_residual_clusters": pct_loss_in_residual,
        "n_residual_customers": int(len(residual)),
        "clusters": clusters,
        "method": (
            "Residual customers = held-out test-set rows where discovered_policy.joblib (v1)'s "
            "prediction disagrees with the true label (false positive/negative), or its "
            "predict_proba is borderline (0.1-0.9). KMeans (k chosen by silhouette score over "
            "k=2..5) clusters these on standardized X_cols. dominant_dimensions = the 2 features "
            "with the largest standardized deviation from the residual population's own mean, per "
            "cluster - i.e. what makes that cluster distinct from other hard cases, not from the "
            "whole dataset."
        ),
    }
    print("=== Residual Behavior Scan (EXPERIMENTAL) ===")
    print(DISCLAIMER)
    print(f"\n{pct_loss_explained}% of held-out loss explained by the known policy; "
          f"{pct_loss_in_residual}% falls in residual/borderline customers ({len(residual)} of {len(test_set)}).")
    print(f"k={best_k} clusters (silhouette={best_score:.3f}):")
    for c in clusters:
        print(f"  cluster {c['cluster_id']}: n={c['size']}, mean_loss=Rs{c['mean_loss_rs']:,.0f}, "
              f"abuse_rate={c['abuse_rate']:.1%}, dominant={c['dominant_dimensions']}")
    return result


if __name__ == "__main__":
    result = run()
    with open(os.path.join(DATA, "residual_cluster_results.json"), "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/residual_cluster_results.json")
