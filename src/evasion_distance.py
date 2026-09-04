"""
Risk Autopsy - Minimum Evasion Distance.

WHY THIS EXISTS: src/attack_coverage.py already sweeps each behavioral
dimension independently and reports "% of the sweep the policy catches."
That's a coverage metric. This file asks a sharper, security-style
question about the exact same fixed point every sweep already starts
from: starting from a pattern the policy currently catches, what is the
SMALLEST behavioral change (in how many dimensions, and by how much) that
flips the decision to "not caught"? A policy that needs a huge behavioral
change to evade is more robust than one a tiny nudge defeats, even if
both score the same raw coverage percentage.

METHOD: reuses attack_coverage.py's exact BASE_PATTERN (the same
known-abuse fixed point) and its row-construction helper directly - not a
duplicate copy, an import - so this can never silently drift from what
the coverage sweep considers "a real abuse pattern." For each of the 6
underlying dimensions (low_amount, mid_amount, time_to_escalation,
account_age offset, device_sharing, address_sharing) independently, a
fine grid search finds the smallest normalized perturbation that flips
the tree's prediction from 1 (caught) to 0 (evaded). Then a coarser 2D
grid repeats the search over every pair of dimensions, since a real
adversary can move more than one lever at once and a combined move can be
smaller than any single-axis move.

Normalization: each dimension's perturbation is expressed as a fraction
of its realistic sweep range (the same ranges attack_coverage.py already
sweeps), so a distance of e.g. 0.30 means "30% of the way across that
dimension's realistic range" - comparable across dimensions of very
different physical units (rupees vs days vs a 0-3 sharing count).

Output: data/evasion_distance_results.json
"""
import os
import json
import sys
import joblib
import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from attack_coverage import BASE_PATTERN, X_COLS, _rows_from_pattern  # noqa: E402

# Realistic range per dimension - identical ranges attack_coverage.py already
# sweeps for each axis, used here purely to normalize distance so different
# units (rupees, days, a 0-3 count) are comparable.
DIMENSION_RANGES = {
    "mid_amount": (8000.0, 60000.0),
    "device_sharing": (0.0, 3.0),
    "address_sharing": (0.0, 3.0),
    "time_to_escalation": (1.0, 30.0),
}
SINGLE_AXIS_GRID = 400
PAIR_AXIS_GRID = 45  # 45*45 ~= 2000 points per pair, same order of magnitude as SEARCH_BUDGET


def _identity(df):
    return df


def _single_axis_search(tree, x_cols=X_COLS, augment_fn=_identity) -> dict:
    results = {}
    for dim, (lo, hi) in DIMENSION_RANGES.items():
        original = BASE_PATTERN[dim]
        grid = np.linspace(lo, hi, SINGLE_AXIS_GRID)
        df = augment_fn(_rows_from_pattern([{dim: v} for v in grid]))
        pred = tree.predict(df[x_cols])
        evaded = grid[pred == 0]
        if len(evaded) == 0:
            results[dim] = None
        else:
            dists = np.abs(evaded - original) / (hi - lo)
            idx = int(np.argmin(dists))
            results[dim] = {"distance": round(float(dists[idx]), 4), "perturbed_value": float(evaded[idx])}
    return results


def _pair_axis_search(tree, x_cols=X_COLS, augment_fn=_identity) -> dict | None:
    dims = list(DIMENSION_RANGES.keys())
    best = None
    for i in range(len(dims)):
        for j in range(i + 1, len(dims)):
            d1, d2 = dims[i], dims[j]
            lo1, hi1 = DIMENSION_RANGES[d1]
            lo2, hi2 = DIMENSION_RANGES[d2]
            g1 = np.linspace(lo1, hi1, PAIR_AXIS_GRID)
            g2 = np.linspace(lo2, hi2, PAIR_AXIS_GRID)
            mesh1, mesh2 = np.meshgrid(g1, g2)
            v1_flat, v2_flat = mesh1.ravel(), mesh2.ravel()
            df = augment_fn(_rows_from_pattern([{d1: a, d2: b} for a, b in zip(v1_flat, v2_flat)]))
            pred = tree.predict(df[x_cols])
            mask = pred == 0
            if not mask.any():
                continue
            dist1 = np.abs(v1_flat[mask] - BASE_PATTERN[d1]) / (hi1 - lo1)
            dist2 = np.abs(v2_flat[mask] - BASE_PATTERN[d2]) / (hi2 - lo2)
            dist = np.sqrt(dist1 ** 2 + dist2 ** 2)
            idx = int(np.argmin(dist))
            if best is None or dist[idx] < best["distance"]:
                best = {
                    "distance": round(float(dist[idx]), 4),
                    "dimensions": [d1, d2],
                    "perturbed_point": {d1: float(v1_flat[mask][idx]), d2: float(v2_flat[mask][idx])},
                }
    return best


def compute_minimum_evasion_distance(tree, x_cols=X_COLS, augment_fn=_identity) -> dict:
    """augment_fn lets a caller with engineered features on top of the base
    6 dimensions (e.g. backend/agent.py's candidate hypotheses) add those
    derived columns before prediction - the search still only perturbs the
    real underlying behavioral dimensions, it just evaluates the candidate
    tree's actual feature set."""
    single = _single_axis_search(tree, x_cols, augment_fn)
    pair = _pair_axis_search(tree, x_cols, augment_fn)

    candidates = []
    for dim, res in single.items():
        if res is not None:
            candidates.append({"distance": res["distance"], "dimensions": [dim],
                                "perturbed_point": {dim: res["perturbed_value"]}})
    if pair is not None:
        candidates.append(pair)

    if not candidates:
        return {
            "minimum_distance": None,
            "dimensions": None,
            "perturbed_point": None,
            "original_point": BASE_PATTERN,
            "per_dimension_single_axis_distance": {k: (v["distance"] if v else None) for k, v in single.items()},
            "note": "No single- or paired-dimension perturbation within the searched realistic "
                    "range evaded this policy - this pattern is robustly caught.",
        }

    winner = min(candidates, key=lambda c: c["distance"])
    return {
        "minimum_distance": winner["distance"],
        "dimensions": winner["dimensions"],
        "perturbed_point": winner["perturbed_point"],
        "original_point": BASE_PATTERN,
        "per_dimension_single_axis_distance": {k: (v["distance"] if v else None) for k, v in single.items()},
    }


def run() -> dict:
    pre_tree = joblib.load(os.path.join(DATA, "discovered_policy_final.joblib"))
    pre = compute_minimum_evasion_distance(pre_tree)

    post = None
    post_path = os.path.join(DATA, "discovered_policy_remediated.joblib")
    if os.path.exists(post_path):
        post_tree = joblib.load(post_path)
        post = compute_minimum_evasion_distance(post_tree)

    result = {
        "pre_remediation": pre,
        "post_remediation": post,
        "method": (
            f"Starting from attack_coverage.py's BASE_PATTERN (a known-abuse fixed point every "
            f"dimension sweep already knows this policy currently catches), a fine grid search "
            f"({SINGLE_AXIS_GRID} points per axis, {PAIR_AXIS_GRID}x{PAIR_AXIS_GRID} per pair) finds "
            f"the smallest normalized perturbation - single-axis or two-axis combined - that flips "
            f"the policy's prediction from caught (1) to evaded (0). Distance is normalized per "
            f"dimension by its realistic sweep range so units (rupees, days, a 0-3 sharing count) "
            f"are comparable; a 2-axis distance is Euclidean over the two normalized deltas."
        ),
    }
    print("=== Minimum Evasion Distance ===")
    print(f"Pre-remediation:  {pre['minimum_distance']} via {pre['dimensions']}")
    if post:
        print(f"Post-remediation: {post['minimum_distance']} via {post['dimensions']}")
    print("Per-dimension single-axis distances (pre):")
    for dim, d in pre["per_dimension_single_axis_distance"].items():
        print(f"  {dim:22s} {d}")
    return result


if __name__ == "__main__":
    result = run()
    with open(os.path.join(DATA, "evasion_distance_results.json"), "w") as f:
        json.dump(result, f, indent=2)
    print("\nSaved: data/evasion_distance_results.json")
