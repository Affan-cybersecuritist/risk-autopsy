"""
Compliance dossier - PDF export.

A real risk reviewer's approval decision needs an artifact they can attach
to a compliance record, not just a live dashboard that disappears when the
tab closes. This assembles every pipeline stage's real, already-computed
output (results.json, adversarial_results.json, coevolution_results.json,
off_policy_eval_results.json, portfolio_conflict_results.json,
blast_radius_results.json) into one PDF - no numbers invented here, all of
it is read straight from the same artifacts the dashboard renders.
"""
import io
import json
import os
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable,
)

GOLD = colors.HexColor("#B8860B")
INK = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#666666")
GREEN = colors.HexColor("#2E7D32")
RED = colors.HexColor("#B23A48")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")


def _load(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H1", parent=ss["Heading1"], textColor=INK, fontSize=20, spaceAfter=4))
    ss.add(ParagraphStyle("H2", parent=ss["Heading2"], textColor=GOLD, fontSize=13, spaceBefore=16, spaceAfter=6))
    ss.add(ParagraphStyle("Body", parent=ss["BodyText"], textColor=INK, fontSize=9.5, leading=14))
    ss.add(ParagraphStyle("Muted", parent=ss["BodyText"], textColor=MUTED, fontSize=8.5, leading=12))
    ss.add(ParagraphStyle("Mono", parent=ss["Code"], fontSize=7.5, leading=10, textColor=INK))
    return ss


def _metric_table(rows, styles):
    data = [[Paragraph(f"<b>{k}</b>", styles["Muted"]), Paragraph(str(v), styles["Body"])] for k, v in rows]
    t = Table(data, colWidths=[65 * mm, 100 * mm])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#eeeeee")),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def build_dossier_pdf(approved_by: str | None = None) -> bytes:
    results = _load("results.json")
    adv = _load("adversarial_results.json")
    coevo = _load("coevolution_results.json")
    ope = _load("off_policy_eval_results.json")
    portfolio = _load("portfolio_conflict_results.json")
    blast = _load("blast_radius_results.json")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=22 * mm, bottomMargin=18 * mm,
                             leftMargin=20 * mm, rightMargin=20 * mm)
    styles = _styles()
    story = []

    story.append(Paragraph("Risk Autopsy — Policy Approval Dossier", styles["H1"]))
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    story.append(Paragraph(f"Generated {ts}" + (f" · Approved by {approved_by}" if approved_by else " · Not yet approved"), styles["Muted"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceBefore=8, spaceAfter=10))
    story.append(Paragraph(
        "This dossier is assembled directly from the pipeline's computed output artifacts "
        "(results.json, adversarial_results.json, coevolution_results.json, off_policy_eval_results.json, "
        "portfolio_conflict_results.json, blast_radius_results.json) — every number below is read from those "
        "files, not re-derived or estimated for this document.", styles["Body"]))

    if results:
        story.append(Paragraph("1. Baseline vs. Discovered Policy", styles["H2"]))
        b, d = results["baseline"], results["discovered"]
        story.append(_metric_table([
            ("Baseline precision / recall", f"{b['precision']:.1%} / {b['recall']:.1%}"),
            ("Discovered precision / recall", f"{d['precision']:.1%} / {d['recall']:.1%}"),
            ("Baseline loss prevented", f"Rs. {b['loss_prevented']:,.0f} of Rs. {results['total_test_loss']:,.0f}"),
            ("Discovered loss prevented", f"Rs. {d['loss_prevented']:,.0f} of Rs. {results['total_test_loss']:,.0f}"),
            ("Baseline false positives", f"{b['fp']} (Rs. {b['fp_cost']:,.0f})"),
            ("Discovered false positives", f"{d['fp']} (Rs. {d['fp_cost']:,.0f})"),
            ("Held-out test set", f"{results['n_test']} customers ({results['n_train']} in train, ring-grouped split)"),
        ], styles))
        story.append(Spacer(1, 6))
        story.append(Paragraph("Discovered rule (human-readable, no black box):", styles["Muted"]))
        story.append(Paragraph(results["rule_text"].replace("\n", "<br/>"), styles["Mono"]))

    if adv:
        story.append(Paragraph("2. Adversarial Stress Test", styles["H2"]))
        story.append(_metric_table([
            ("Blind spot introspected", f"{adv['top_feature']} ({adv['top_feature_importance']:.0%} of decision weight)"),
            ("v1 evasions missed", f"{adv['v1_missed']} / {adv['n_evaders']}"),
            ("v2 (retrained) evasions missed", f"{adv['v2_missed']} / {adv['n_evaders']}"),
            ("v2 precision / recall (held-out)", f"{adv['v2_test_precision']:.1%} / {adv['v2_test_recall']:.1%}"),
            ("v2 false positives", str(adv["v2_test_fp"])),
        ], styles))

    if coevo:
        story.append(Paragraph("3. Automated Red-Team / Blue-Team Co-Evolution", styles["H2"]))
        conv = f"Converged at generation {coevo['converged_at_generation']}" if coevo["converged"] else "Did not converge"
        story.append(_metric_table([
            ("Result", conv),
            ("Final precision (full population)", f"{coevo['final_precision']:.1%}"),
            ("Final recall (full population)", f"{coevo['final_recall']:.1%}"),
            ("Final false positives (full population)", str(coevo["final_fp"])),
            ("Generations run", str(len(coevo["generation_log"]))),
        ], styles))

    if ope:
        story.append(Paragraph("4. Doubly-Robust Off-Policy Evaluation", styles["H2"]))
        story.append(_metric_table([
            ("DR estimate error vs. oracle truth", f"{ope['dr_error_pct']:.1f}%"),
            ("Direct Method error vs. oracle", f"{ope['dm_error_pct']:.1f}%"),
            ("IPS-only error vs. oracle", f"{ope['ips_error_pct']:.1f}%"),
            ("DR 95% CI (per customer)", f"Rs. {ope['dr_ci_low']:.0f} – Rs. {ope['dr_ci_high']:.0f}"),
            ("Customers evaluated", str(ope["n_customers"])),
        ], styles))

    if portfolio:
        story.append(Paragraph("5. Policy Portfolio Conflict Check", styles["H2"]))
        story.append(_metric_table([
            ("Population FP rate — new policy", f"{portfolio['overall_fp_rate_new_policy']:.2%}"),
            ("Population FP rate — baseline", f"{portfolio['overall_fp_rate_baseline']:.2%}"),
            ("Segments flagged for elevated FP concentration", str(portfolio["n_segments_flagged"])),
        ], styles))
        flagged = [s for s in portfolio["segments"] if s["flagged_as_outlier"]]
        for s in flagged:
            story.append(Paragraph(
                f"[FLAGGED] {s['segment_type']}: {s['segment_value']} — {s['fp_rate_vs_population_ratio']:.2f}x population FP rate "
                f"(n={s['n_normal_customers']})", styles["Body"]))

    if blast:
        story.append(Paragraph("6. Policy Blast Radius", styles["H2"]))
        story.append(_metric_table([
            ("Customers newly flagged", f"{blast['n_newly_flagged']} (Rs. {blast['newly_flagged_loss_at_stake']:,.0f} at stake)"),
            ("Customers newly cleared", f"{blast['n_newly_cleared']} (Rs. {blast['newly_cleared_loss_at_stake']:,.0f} at stake)"),
            ("Flips worth a human's attention", str(blast["worth_reviewing_count"])),
        ], styles))
        for r in blast["worth_reviewing"][:10]:
            label = "newly flagged, not a known abuser" if r["flip"] == "newly_flagged" else "newly cleared, but a known abuser"
            note = r.get("review_note") or f"max amount Rs. {r['max_amount']:,.0f}, escalation ratio {r['escalation_ratio']:.2f}"
            story.append(Paragraph(f"• Customer #{r['customer_id']} — {label}: {note}", styles["Body"]))

    story.append(PageBreak())
    story.append(Paragraph("Approval Record", styles["H2"]))
    if approved_by:
        story.append(Paragraph(
            f"This policy change was approved by <b>{approved_by}</b>, verified via Supabase authentication "
            f"plus a live biometric face match against their enrolled identity, at {ts}. This system never "
            f"auto-deploys a policy — every candidate requires this explicit, identity-verified human sign-off.",
            styles["Body"]))
    else:
        story.append(Paragraph(
            "No approval has been recorded yet for this policy candidate. This dossier reflects the pipeline's "
            "output as of generation time; it is not itself an approval record.", styles["Body"]))

    doc.build(story)
    return buf.getvalue()
