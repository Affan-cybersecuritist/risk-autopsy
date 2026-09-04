"""
Risk Autopsy - README claim verification.

WHY THIS FILE EXISTS: the README makes a lot of specific numerical claims
(precision, recall, false-positive counts, off-policy error, blast-radius
counts, attack coverage percentages). If a pipeline script changes and the
README doesn't get updated to match, the submission contains a false
claim - exactly the kind of thing a technical judge checks first. This
file encodes every claim that comes from a DETERMINISTIC, fixed-seed
script (features_and_policy.py, coevolution.py, remediate_drift.py,
off_policy_eval.py, blast_radius.py, portfolio_conflict_check.py,
attack_coverage.py all use a fixed rng seed, so their outputs don't change
between runs) as a real assertion against the committed data files.

WHAT THIS DELIBERATELY DOES NOT TEST: the Autonomous Risk Policy Engine's
own candidate generation (backend/agent.py) is intentionally
non-deterministic - different runs produce different LLM-proposed
hypotheses at temperature 0.4, and the README says so explicitly. Testing
for an exact winner there would be testing a false claim of determinism
this project doesn't make. Structural properties of that system (gates
exist, blocking works, etc.) are covered in test_pipeline.py's
TestAutonomousAgent instead.

Run with: pytest tests/test_claims.py -v
"""
import os
import json
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def _load(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        pytest.skip(f"data/{name} missing - run the corresponding src/*.py script first")
    with open(path) as f:
        return json.load(f)


class TestBaselineAndV1Claims:
    """README: 'Baseline (amount > Rs 25,000) 32.9% precision, 58.3%
    recall, 57 false positives' / 'Discovered v1 ... 90.6% precision,
    100.0% recall, 5 false positives'."""

    @pytest.fixture(scope="class")
    def results(self):
        return _load("results.json")

    def test_baseline_precision_recall_fp(self, results):
        b = results["baseline"]
        assert b["precision"] == pytest.approx(0.329, abs=0.001)
        assert b["recall"] == pytest.approx(0.583, abs=0.001)
        assert b["fp"] == 57

    def test_v1_precision_recall_fp(self, results):
        d = results["discovered"]
        assert d["precision"] == pytest.approx(0.906, abs=0.001)
        assert d["recall"] == pytest.approx(1.0, abs=0.001)
        assert d["fp"] == 5

    def test_loss_prevented_matches_readme(self, results):
        assert results["discovered"]["loss_prevented"] == pytest.approx(1463002, abs=10)
        assert results["total_test_loss"] == pytest.approx(1463002, abs=10)


class TestAdversarialAndCoevolutionClaims:
    """README: 'v1 misses 100% of an evasion targeting its top feature' /
    'converges at generation 2 ... 100% precision / 100% recall / 0 false
    positives ... catches 40/40 evasion attempts'."""

    def test_v1_misses_the_targeted_evasion_completely(self):
        adv = _load("adversarial_results.json")
        assert adv["top_feature"] == "escalation_ratio"
        assert adv["n_evaders"] == 40
        assert adv["v1_caught"] == 0 and adv["v1_missed"] == 40
        assert adv["v2_caught"] == 40 and adv["v2_missed"] == 0

    def test_coevolution_converged_at_generation_2_with_perfect_final_metrics(self):
        coevo = _load("coevolution_results.json")
        assert coevo["converged"] is True
        assert coevo["converged_at_generation"] == 2
        assert coevo["final_precision"] == pytest.approx(1.0)
        assert coevo["final_recall"] == pytest.approx(1.0)
        assert coevo["final_fp"] == 0


class TestOffPolicyClaims:
    """README: 'DR estimate lands within 2.2% of the true value ... vs.
    6.9% for the Direct Method alone and 18.5% for importance-weighting
    alone'."""

    def test_dr_estimator_error_matches_readme(self):
        ope = _load("off_policy_eval_results.json")
        assert ope["dr_error_pct"] == pytest.approx(2.2, abs=0.3)
        assert ope["dm_error_pct"] == pytest.approx(6.9, abs=0.5)
        assert ope["ips_error_pct"] == pytest.approx(18.5, abs=1.0)
        # the ordering claim matters more than the exact digits - DR must
        # actually be the best of the three, or the section's whole point is false
        assert ope["dr_error_pct"] < ope["dm_error_pct"] < ope["ips_error_pct"]


class TestBlastRadiusClaims:
    """README: '25 customers newly flagged (Rs 2,71,122 at stake), 57
    newly cleared ... 5 of 82 flips worth human attention'."""

    def test_blast_radius_counts_match_readme(self):
        blast = _load("blast_radius_results.json")
        assert blast["n_newly_flagged"] == 25
        assert blast["n_newly_cleared"] == 57
        assert blast["newly_flagged_loss_at_stake"] == pytest.approx(271122, abs=10)
        assert blast["worth_reviewing_count"] == 5
        assert blast["n_newly_flagged"] + blast["n_newly_cleared"] == 82


class TestPortfolioConflictClaims:
    """README: 'a real 8.2x elevated false-positive rate in the Rs 5-15k
    segment'."""

    def test_flagged_segment_ratio_matches_readme(self):
        portfolio = _load("portfolio_conflict_results.json")
        flagged = [s for s in portfolio["segments"] if s["flagged_as_outlier"]]
        assert len(flagged) >= 1
        ratios = [s["fp_rate_vs_population_ratio"] for s in flagged if s["fp_rate_vs_population_ratio"]]
        assert any(r == pytest.approx(8.2, abs=0.3) for r in ratios), (
            f"expected a flagged segment near 8.2x, got ratios {ratios}"
        )


class TestDriftAndRemediationClaims:
    """README: 'recall holds at 100% through month 7, then collapses to 0%
    by month 11 ... alert fires at month 10' / after remediation, 'recall
    holds at 100% across all 12 months'."""

    def test_drift_before_remediation_matches_readme(self):
        drift = _load("drift_monitor_results.json")
        assert drift["alert_month"] == 10
        by_month = {m["month"]: m["recall"] for m in drift["months"]}
        assert by_month[7] == pytest.approx(1.0)
        assert by_month[11] == pytest.approx(0.0, abs=0.01)

    def test_drift_after_remediation_never_collapses(self):
        after = _load("drift_monitor_remediated_results.json")
        assert after["fixed"] is True
        assert after["alert_month"] is None
        assert all(m["recall"] >= 0.99 for m in after["months"])

    def test_remediation_reconverges_at_generation_2(self):
        remediated = _load("coevolution_remediated_results.json")
        assert remediated["converged"] is True
        assert remediated["converged_at_generation"] == 2


class TestAttackCoverageClaims:
    """README: table showing 4 of 5 dimensions at 100% pre-remediation,
    strike timing at 73% -> 100%."""

    def test_coverage_table_matches_readme(self):
        coverage = _load("attack_coverage_results.json")
        pre = coverage["pre_remediation"]
        for dim in ["Amount manipulation", "Ring density", "Device sharing", "Address sharing"]:
            assert pre[dim] == pytest.approx(100.0, abs=0.5)
        assert pre["Strike timing"] == pytest.approx(73.0, abs=3.0)
        if coverage["post_remediation"]:
            assert coverage["post_remediation"]["Strike timing"] == pytest.approx(100.0, abs=0.5)


class TestCounterfactualReplayClaims:
    """README: 'an estimated Rs 17,34,422 in additional prevented loss ...
    within 2.2% of the true synthetic value'."""

    def test_counterfactual_value_and_error_match_readme(self):
        cf = _load("counterfactual_replay_results.json")
        assert cf["total_dr_estimated_missed_value"] == pytest.approx(1734422, abs=5000)
        assert cf["dr_error_pct"] < 5.0
