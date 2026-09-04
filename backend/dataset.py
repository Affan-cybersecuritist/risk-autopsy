"""
Arbitrary-dataset ingestion.

The demo pipeline (src/*.py) trains against synthetic data that carries a
ground-truth is_abuse_ring label - fine for proving the ML methodology, but
a real uploaded CSV won't have that label. So an uploaded dataset gets a
different, honest treatment: no fabricated "we detected the ring with 100%
precision" claim, just the same shared-device/shared-address/escalation
signals the rest of the app is built on, applied unsupervised, plus an LLM
narrative summarizing what those signals show.
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone

import pandas as pd

REQUIRED = ["customer_id", "day", "amount", "txn_type", "device_id", "address_id"]

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TENANTS_DIR = os.path.join(BASE, "data", "tenants")

# Real path-traversal vulnerability found and fixed during a security audit:
# get_tenant()/delete_tenant() built a filesystem path directly from a
# client-supplied tenant_id with no validation. FastAPI's default {tenant_id}
# path converter blocks a literal "/", but not "\" - and on Windows (this
# project's dev platform) a backslash IS a path separator, so a request like
# GET /api/tenants/..%5Cpolicy_history successfully read data/policy_history.json
# in full through this endpoint - confirmed by direct exploitation, not just
# inferred. tenant_id is always a save_tenant()-generated uuid4().hex[:12],
# so anything that doesn't match that exact shape is rejected outright.
_TENANT_ID_RE = re.compile(r"^[0-9a-f]{12}$")


def _safe_tenant_path(tenant_id: str) -> str | None:
    if not _TENANT_ID_RE.match(tenant_id):
        return None
    return os.path.join(TENANTS_DIR, f"{tenant_id}.json")


def apply_mapping(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    missing = [k for k in REQUIRED if not mapping.get(k)]
    if missing:
        raise ValueError(f"could not map required columns: {missing}")
    out = pd.DataFrame({k: df[mapping[k]] for k in REQUIRED})
    out["amount"] = pd.to_numeric(out["amount"], errors="coerce")
    out["day"] = pd.to_numeric(out["day"], errors="coerce")
    out = out.dropna(subset=["amount", "day"])
    return out


def analyze(txns: pd.DataFrame) -> dict:
    """Unsupervised ring-signal analysis on arbitrary uploaded transactions."""
    chargebacks = txns[txns.txn_type.str.contains("chargeback|refund", case=False, na=False)]
    total_loss = float(chargebacks.amount.sum())

    shared_device = txns.groupby("device_id").customer_id.nunique()
    shared_address = txns.groupby("address_id").customer_id.nunique()
    ring_devices = shared_device[shared_device > 1]
    ring_addresses = shared_address[shared_address > 1]

    flagged_customers = set()
    for dev in ring_devices.index:
        flagged_customers.update(txns[txns.device_id == dev].customer_id.unique().tolist())
    for addr in ring_addresses.index:
        flagged_customers.update(txns[txns.address_id == addr].customer_id.unique().tolist())

    per_customer = txns.groupby("customer_id").amount.agg(["count", "sum", "max"]).reset_index()
    per_customer.columns = ["customer_id", "n_txns", "total_amount", "max_amount"]

    return {
        "total_customers": int(txns.customer_id.nunique()),
        "total_transactions": int(len(txns)),
        "total_chargeback_loss": total_loss,
        "shared_device_clusters": int(len(ring_devices)),
        "shared_address_clusters": int(len(ring_addresses)),
        "flagged_customer_count": len(flagged_customers),
        "flagged_customer_ids": sorted(flagged_customers)[:50],
        "top_customers_by_amount": per_customer.sort_values("total_amount", ascending=False).head(10).to_dict("records"),
    }


def save_tenant(name: str, mapping: dict, analysis: dict) -> dict:
    """Persist an uploaded merchant's analysis as its own workspace, so a
    reviewer can revisit it later without re-uploading - this is what makes
    'bring your own data' a real multi-tenant workspace switcher rather than
    a one-shot, forgotten-on-refresh analysis."""
    os.makedirs(TENANTS_DIR, exist_ok=True)
    tenant_id = uuid.uuid4().hex[:12]
    record = {
        "id": tenant_id,
        "name": name,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "column_mapping": mapping,
        "analysis": analysis,
    }
    with open(os.path.join(TENANTS_DIR, f"{tenant_id}.json"), "w") as f:
        json.dump(record, f, indent=2)
    return record


def list_tenants() -> list[dict]:
    if not os.path.isdir(TENANTS_DIR):
        return []
    out = []
    for fname in sorted(os.listdir(TENANTS_DIR)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(TENANTS_DIR, fname)) as f:
            record = json.load(f)
        out.append({
            "id": record["id"], "name": record["name"], "uploaded_at": record["uploaded_at"],
            "total_customers": record["analysis"]["total_customers"],
            "total_chargeback_loss": record["analysis"]["total_chargeback_loss"],
            "flagged_customer_count": record["analysis"]["flagged_customer_count"],
        })
    return sorted(out, key=lambda r: r["uploaded_at"], reverse=True)


def get_tenant(tenant_id: str) -> dict | None:
    path = _safe_tenant_path(tenant_id)
    if path is None or not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def delete_tenant(tenant_id: str) -> bool:
    path = _safe_tenant_path(tenant_id)
    if path is None or not os.path.exists(path):
        return False
    os.remove(path)
    return True
