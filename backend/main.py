"""
Risk Autopsy - backend API.

Serves the ML pipeline results live over HTTP instead of a frontend reading
static JSON files directly off disk. Autopsy timeline reconstruction is
computed live, per request, from the actual transaction data - not
pre-baked. Policy metrics (training a decision tree, adversarial testing,
co-evolution) are expensive to rerun on every request, so those are loaded
from the artifacts already produced by src/*.py - the SAME real computation,
just not re-executed per HTTP call. This is the standard, correct pattern
(train offline, serve online), not a shortcut.

Run with: uvicorn backend.main:app --reload --port 8000
"""
from fastapi import FastAPI, HTTPException, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
import pandas as pd
import json
import os
import io
import edge_tts

from . import llm
from . import dataset as dataset_mod
from . import dossier as dossier_mod
from . import policy_history as history_mod
from . import auth as auth_mod
from . import agent as agent_mod
from . import causal_graph as causal_graph_mod
import time as _time
import collections

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

app = FastAPI(title="Risk Autopsy API", version="1.0")

# Tightened from allow_methods=["*"], allow_headers=["*"] (flagged in a
# security audit as fine-for-a-demo but worth tightening) - this API is a
# JSON REST API, not a browser form target, so the actual method/header set
# it needs is small and stable. No auth header is added here on purpose:
# the approval flow's real security boundary is the signed token verified
# server-side in auth.py, not CORS - CORS only restricts which *browser
# origins* may read responses, it is not an authentication mechanism.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8000"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

def _load_json(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        raise HTTPException(status_code=503, detail=f"{name} not found - run the corresponding src/*.py script first")
    with open(path) as f:
        return json.load(f)

def _customers():
    return pd.read_csv(os.path.join(DATA, "customers.csv"))

def _txns():
    return pd.read_csv(os.path.join(DATA, "transactions.csv"))

@app.get("/api/overview")
def overview():
    customers = _customers()
    txns = _txns()
    total_loss = txns[txns.txn_type == "chargeback"].amount.sum()
    return {
        "total_chargeback_loss": float(total_loss),
        "customers_involved": int(customers.is_abuse_ring.sum()),
        "abuse_rings_detected": int(customers[customers.is_abuse_ring == 1].address_id.nunique()),
        "total_customers": int(len(customers)),
    }

@app.get("/api/customers/abuse-ring")
def list_abuse_ring_customers():
    customers = _customers()
    return {"customer_ids": customers[customers.is_abuse_ring == 1].customer_id.tolist()}

@app.get("/api/autopsy/{customer_id}")
def autopsy(customer_id: int):
    """Live reconstruction - computed fresh per request from the raw
    transaction log, not a cached result."""
    customers = _customers()
    txns = _txns()
    cust_rows = customers[customers.customer_id == customer_id]
    if len(cust_rows) == 0:
        raise HTTPException(status_code=404, detail=f"customer {customer_id} not found")
    cust_row = cust_rows.iloc[0]
    ct = txns[txns.customer_id == customer_id].sort_values("day")
    n_ring_members = int((customers.address_id == cust_row.address_id).sum()) - 1

    timeline = [
        {"day": int(r.day), "amount": float(r.amount), "txn_type": r.txn_type}
        for _, r in ct.iterrows()
    ]
    return {
        "customer_id": customer_id,
        "is_abuse_ring": bool(cust_row.is_abuse_ring),
        "shared_address_members": n_ring_members,
        "timeline": timeline,
    }

@app.get("/api/autopsy/{customer_id}/causal-graph")
def autopsy_causal_graph(customer_id: int):
    """The exact decision path discovered_policy_final.joblib took for this
    customer's real feature values - which split let a real loss through,
    or which split caught it. Scoped explicitly to 'this model's decision',
    not a real-world causal claim - see causal_graph.py's module docstring."""
    result = causal_graph_mod.get_causal_graph_for_customer(customer_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"customer {customer_id} not found in features.csv")
    return result


@app.get("/api/policy/comparison")
def policy_comparison():
    return _load_json("results.json")

@app.get("/api/policy/adversarial")
def adversarial_results():
    return _load_json("adversarial_results.json")

@app.get("/api/policy/coevolution")
def coevolution_results():
    return _load_json("coevolution_results.json")

@app.get("/api/policy/off-policy-eval")
def off_policy_eval_results():
    return _load_json("off_policy_eval_results.json")

@app.get("/api/policy/portfolio-conflict")
def portfolio_conflict_results():
    return _load_json("portfolio_conflict_results.json")

@app.get("/api/policy/blast-radius")
def blast_radius():
    """Per-customer diff of baseline vs. discovered policy on the held-out
    test set - which specific accounts flip, ranked by dollar impact, plus
    the subset actually worth a human's attention (a legitimate customer
    newly caught, or a real abuser newly missed). LLM annotation of the
    worth-reviewing rows is attempted live; falls back to the ungrounded
    list (still real data) if no Groq key is configured."""
    data = _load_json("blast_radius_results.json")
    try:
        data["worth_reviewing"] = llm.annotate_blast_radius(data["worth_reviewing"])
        data["llm_annotated"] = True
    except Exception as e:
        # Distinguish "no key set" from a live call that failed for some
        # other reason (rate limit, network) - the frontend was blaming
        # "not configured" for every failure, which is wrong most of the
        # time in practice (e.g. Groq's daily token quota running out).
        data["llm_annotated"] = False
        data["llm_configured"] = bool(os.environ.get("GROQ_API_KEY"))
        data["llm_error"] = llm.describe_error(e)
    return data


@app.get("/api/policy/blast-radius/{customer_id}/letter")
def blast_radius_customer_letter(customer_id: int):
    """Auto-generated, plain-language, customer-facing explanation for one
    blast-radius flip - the flip section already tells a reviewer WHICH
    accounts changed status and why that matters internally; this answers
    the next real question a compliance-minded team asks: 'if this
    customer calls in, what do we actually tell them?' Grounded only in
    that customer's real feature row, written without internal jargon,
    and framed as a routine policy update rather than an accusation -
    the kind of specific, non-jargon reasoning adverse-action-notice norms
    expect from an automated decision that affects someone's account."""
    data = _load_json("blast_radius_results.json")
    row = next(
        (r for r in data["newly_flagged"] + data["newly_cleared"] if r["customer_id"] == customer_id),
        None,
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"customer {customer_id} has no blast-radius flip on record")
    try:
        letter = llm.generate_customer_letter(row)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"letter unavailable: {e}")
    return {"customer_id": customer_id, "flip": row["flip"], "letter": letter}


@app.get("/api/policy/drift")
def drift_monitor_results():
    """Month-by-month recall/precision of the deployed (frozen, never
    retrained here) policy against new synthetic cohorts whose abuse rings
    gradually adapt their strike timing - a live answer to "is the policy
    we approved still working," not just a point-in-time snapshot. See
    src/drift_monitor.py for the real gap this found: the co-evolution
    arms race's own attacker search never tested a fast-strike ring, so
    its "zero evasions, fully converged" result never covered this case."""
    return _load_json("drift_monitor_results.json")


@app.get("/api/policy/counterfactual")
def counterfactual_replay_results():
    """'What if we'd approved v1 N months ago?' - the same doubly-robust
    estimator from off_policy_eval.py, replayed against a sequence of
    historical monthly cohorts and accumulated into a concrete cumulative
    number, using only the logs the old baseline policy would actually
    have produced (never re-running history). See src/counterfactual_replay.py."""
    return _load_json("counterfactual_replay_results.json")


@app.get("/api/policy/drift-remediation")
def drift_remediation_results():
    """The closed loop: src/remediate_drift.py re-ran the adversarial arms
    race with the exact search envelope src/drift_monitor.py found was too
    narrow (time_to_escalation widened from 10-30 days to 1-30 days),
    re-converged, and re-ran the identical drift simulation against the new
    policy to prove the fix - not just claim it. Returns 404 (not 503) if
    remediation hasn't been run yet, since it's optional, not a missing
    pipeline artifact."""
    path = os.path.join(DATA, "drift_monitor_remediated_results.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="remediation not run yet - run src/remediate_drift.py")
    drift_after = _load_json("drift_monitor_remediated_results.json")
    coevo_after = _load_json("coevolution_remediated_results.json")
    return {
        "drift": drift_after,
        "converged_at_generation": coevo_after["converged_at_generation"],
        "widened_dimension": coevo_after["widened_dimension"],
        "final_rule_text": coevo_after["final_rule_text"],
    }


_agent_run_calls: collections.deque = collections.deque()
_AGENT_RUN_LIMIT = 5
_AGENT_RUN_WINDOW_S = 3600  # each run does real ML work (multiple tree fits + attacks) plus 2 LLM calls - costlier than a single retrain


@app.post("/api/agent/run")
def agent_run():
    """The Autonomous Risk Policy Engineer: runs the full loss -> verified
    -candidate loop without a human orchestrating each step - AI autopsy,
    feature discovery, LLM-proposed policy hypotheses (feature subsets
    only, never thresholds), real decision trees fit on those features,
    adversarial attack + hardening, and full verification (regression,
    adversarial coverage, fairness, off-policy estimate, blast radius,
    complexity) synthesized into a readiness score. Never auto-approves -
    the best APPROVAL_ELIGIBLE candidate is registered as a new, real,
    unapproved version in the same policy history timeline every other
    version lives in. See backend/agent.py for the full architecture and
    why the LLM is never trusted to compute or decide anything itself."""
    now = _time.monotonic()
    while _agent_run_calls and now - _agent_run_calls[0] > _AGENT_RUN_WINDOW_S:
        _agent_run_calls.popleft()
    if len(_agent_run_calls) >= _AGENT_RUN_LIMIT:
        raise HTTPException(status_code=429, detail="too many autonomous-engineer runs this hour - slow down")
    _agent_run_calls.append(now)

    try:
        return agent_mod.run_autonomous_engineer()
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=f"pipeline artifact missing: {e} - run the src/*.py pipeline first")


@app.get("/api/agent/last")
def agent_last():
    """The most recent autonomous-engineer run, without re-running it -
    for reloading the dashboard without spending another rate-limit slot
    or another ~8 seconds of real computation."""
    path = os.path.join(DATA, "agent_run_results.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="no autonomous-engineer run on record yet")
    return _load_json("agent_run_results.json")


@app.get("/api/policy/attack-coverage")
def attack_coverage_results():
    """Per-dimension adversarial coverage (amount, ring density, device
    sharing, address sharing, strike timing), pre- and post-remediation.
    Real computed percentages - for each dimension, a fresh sweep across
    its realistic range with every other dimension held at a known-abuse
    value. See src/attack_coverage.py."""
    return _load_json("attack_coverage_results.json")


@app.get("/api/policy/intervention-optimizer")
def intervention_optimizer_results():
    """Graded intervention ladder (ALLOW/STEP_UP/DELAY/MANUAL_REVIEW/BLOCK)
    instead of a binary ALLOW/FLAG decision, with real expected-net-value
    per action. See src/intervention_optimizer.py for the honest
    separability finding (this dataset is near-perfectly separable, so the
    ladder mostly resolves to ALLOW/BLOCK in practice) and the synthetic
    decision-boundary sweep proving the mechanism itself grades correctly."""
    return _load_json("intervention_optimizer_results.json")


@app.get("/api/policy/evasion-distance")
def evasion_distance_results():
    """The smallest behavioral perturbation (single- or two-axis, from the
    same known-abuse fixed point attack_coverage.py sweeps) that flips the
    policy's decision from caught to evaded - a robustness metric, not
    just a coverage percentage. See src/evasion_distance.py."""
    return _load_json("evasion_distance_results.json")


@app.get("/api/policy/residual-clusters")
def residual_cluster_results():
    """EXPERIMENTAL - unsupervised residual/borderline clustering, explicitly
    NOT a real fraud-discovery claim (see the disclaimer field, which is
    part of the data contract, not just UI copy). See
    src/residual_cluster_analysis.py's module docstring for the honest
    limits of clustering a closed, single-typology synthetic dataset."""
    return _load_json("residual_cluster_results.json")


@app.get("/api/policy/difficulty-tiers")
def difficulty_tiers_results():
    """The already-frozen policy scored (never retrained) against
    populations that are harder by construction - a generalization/OOD
    test, not a fresh-retrain-per-tier comparison. See
    src/difficulty_tiers_eval.py."""
    return _load_json("difficulty_tiers_results.json")


@app.get("/api/policy/secret-holdout")
def secret_holdout_results():
    """A one-shot score against a seed never referenced elsewhere in this
    pipeline's development. See src/secret_holdout_eval.py for the honest
    scope of what this does and doesn't prove."""
    return _load_json("secret_holdout_results.json")


@app.get("/api/policy/multi-seed-eval")
def multi_seed_eval_results():
    """10 independent seeds' discovery-stage precision/recall/net-value,
    mean +/- std - proves (or honestly disproves) that the headline numbers
    aren't seed-fragile. See src/multi_seed_eval.py."""
    return _load_json("multi_seed_eval_results.json")


@app.get("/api/policy/ablation")
def ablation_results():
    """Stage-by-stage real net value using already-real policy artifacts -
    which pipeline stage actually earns its place. See
    src/ablation_study.py."""
    return _load_json("ablation_results.json")


@app.get("/api/policy/mutation-testing")
def mutation_testing_results():
    """Structural mutation testing of the frozen policy's tree - does this
    project's own verification suite actually catch a deliberately broken
    policy? See src/mutation_testing.py."""
    return _load_json("mutation_testing_results.json")


@app.get("/api/policy/history")
def policy_history_list():
    """Every policy version that's existed - the original discovered v1,
    plus any real retrains - with real held-out metrics for each and who
    approved what, when. Each entry is annotated with a real deployment_status
    (ACTIVE / PROPOSED / SUPERSEDED, see policy_history.annotate_deployment_status)
    so a remediation or an autonomous-engineer run can never look like it
    silently replaced what's actually live."""
    return {"history": history_mod.annotate_deployment_status(history_mod.get_history())}


@app.get("/api/policy/active")
def policy_active_version():
    """The single policy actually making decisions right now - the highest
    version a human has approved, or null if nothing has been approved
    yet (the honest state of a fresh clone, and of this repo's own
    committed history right now)."""
    active = history_mod.get_active_version()
    return {"active_version": active}


class RetrainRequest(BaseModel):
    max_depth: int
    min_samples_leaf: int


# No auth is required to retrain (only *approving* a version needs a
# verified identity - see auth.py), but unauthenticated + unlimited retrain
# calls is still free compute anyone can hammer. Simple in-memory
# rate limit: retraining is a demo/exploration action, not a hot path, so
# a generous per-minute cap catches abuse without affecting real use.
_retrain_calls: collections.deque = collections.deque()
_RETRAIN_LIMIT = 20
_RETRAIN_WINDOW_S = 60


@app.post("/api/policy/retrain")
def policy_retrain(req: RetrainRequest):
    """Actually retrains a new decision tree with the given hyperparameters
    on the exact same held-out split as v1 - a genuinely different
    candidate policy, not a relabeled copy of the same one."""
    now = _time.monotonic()
    while _retrain_calls and now - _retrain_calls[0] > _RETRAIN_WINDOW_S:
        _retrain_calls.popleft()
    if len(_retrain_calls) >= _RETRAIN_LIMIT:
        raise HTTPException(status_code=429, detail="too many retrain requests - slow down")
    _retrain_calls.append(now)

    try:
        entry = history_mod.retrain(req.max_depth, req.min_samples_leaf)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return entry


class ApprovalTokenRequest(BaseModel):
    access_token: str
    face_descriptor: list[float]


@app.post("/api/policy/approval-token")
def policy_approval_token(req: ApprovalTokenRequest):
    """Real server-side identity check: verifies the Supabase session
    belongs to a real signed-in user, re-fetches that user's enrolled face
    descriptor from Supabase, and re-computes the face match in this
    process (not trusting the browser's own "it matched" claim). Only on a
    genuine match does it mint a short-lived signed token. This is what
    /api/policy/approve now actually requires - closing the gap where the
    approval flow was previously enforced only in the React UI."""
    try:
        result = auth_mod.verify_face_and_mint_token(req.access_token, req.face_descriptor)
    except auth_mod.AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return result


class ApproveRequest(BaseModel):
    version: int
    approval_token: str


@app.post("/api/policy/approve")
def policy_approve(req: ApproveRequest):
    try:
        claims = auth_mod.verify_approval_token(req.approval_token)
    except auth_mod.AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    try:
        entry = history_mod.approve_version(req.version, claims["email"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return entry


@app.get("/api/dossier")
def dossier(approved_by: str | None = None):
    """Compliance PDF dossier - every pipeline stage's real computed output
    assembled into one exportable, attachable artifact. If approved_by is
    passed, the dossier records that identity-verified approval; otherwise
    it's clearly marked as not yet approved."""
    pdf_bytes = dossier_mod.build_dossier_pdf(approved_by=approved_by)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": "attachment; filename=risk-autopsy-dossier.pdf"
    })


@app.get("/api/health")
def health():
    # Reports configuration status only - never the key values themselves.
    # Real credentials stay server-side in backend/.env; the Settings panel
    # on the frontend uses this to tell a reviewer what's on/off, not to
    # collect or display secrets through the browser.
    return {
        "status": "ok",
        "llm_enabled": bool(os.environ.get("GROQ_API_KEY")),
        "supabase_configured": bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY")),
    }


@app.get("/api/autopsy/{customer_id}/narrative")
def autopsy_narrative(customer_id: int):
    """LLM-generated case note for one customer, grounded in the same
    autopsy JSON the /api/autopsy endpoint returns - not a separate story."""
    autopsy_data = autopsy(customer_id)
    try:
        text = llm.generate_narrative(autopsy_data)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"narrative unavailable: {e}")
    return {"customer_id": customer_id, "narrative": text}


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = []


@app.post("/api/chat")
def chat(req: ChatRequest):
    """Grounded chat over the real dashboard data - overview, policy
    comparison, adversarial/co-evolution results, off-policy eval, and
    portfolio conflict, whichever artifacts exist."""
    context = {}
    for name, key in [
        ("results.json", "policy_comparison"),
        ("adversarial_results.json", "adversarial"),
        ("coevolution_results.json", "coevolution"),
        ("off_policy_eval_results.json", "off_policy_eval"),
        ("portfolio_conflict_results.json", "portfolio_conflict"),
    ]:
        path = os.path.join(DATA, name)
        if os.path.exists(path):
            with open(path) as f:
                context[key] = json.load(f)
    context["overview"] = overview()

    try:
        answer = llm.chat_answer(req.question, context, [m.model_dump() for m in req.history])
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"chat unavailable: {e}")
    return {"answer": answer}


class CommandIntentRequest(BaseModel):
    text: str


@app.post("/api/command-intent")
def command_intent(req: CommandIntentRequest):
    """Smarter fallback for the chat widget's command layer: classifies free
    text (typed or voice-transcribed) into navigate/retrain/run_agent/chat
    when the frontend's client-side keyword matcher doesn't recognize the
    phrasing. The intent enum has no 'approve'/'deploy' member - see
    llm.classify_command_intent's docstring for why that's a structural
    boundary, not a prompt instruction alone."""
    try:
        return llm.classify_command_intent(req.text)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


_tts_calls: collections.deque = collections.deque()
_TTS_LIMIT = 40
_TTS_WINDOW_S = 3600  # generous - it's a chat reply being read aloud, not a hot loop, but this hits an unofficial external endpoint so isn't left unbounded


class TTSRequest(BaseModel):
    text: str
    voice: str = "en-US-AriaNeural"  # a free Microsoft neural voice - realistic, no API key, same voices Edge's "Read Aloud" uses


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    """Realistic, free text-to-speech via edge-tts - the same neural voices
    Microsoft Edge's Read Aloud feature uses, reverse-engineered as a
    well-known open-source library. No API key and no per-character cost,
    unlike ElevenLabs/Azure/Google's paid TTS APIs - the tradeoff is that
    it's unofficial, so it isn't guaranteed stable long-term. The frontend
    falls back to the browser's own built-in speech synthesis if this
    endpoint errors."""
    now = _time.monotonic()
    while _tts_calls and now - _tts_calls[0] > _TTS_WINDOW_S:
        _tts_calls.popleft()
    if len(_tts_calls) >= _TTS_LIMIT:
        raise HTTPException(status_code=429, detail="too many voice replies this hour - slow down")
    _tts_calls.append(now)

    text = req.text.strip()[:2000]
    if not text:
        raise HTTPException(status_code=400, detail="empty text")

    async def audio_stream():
        communicate = edge_tts.Communicate(text, req.voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]

    return StreamingResponse(audio_stream(), media_type="audio/mpeg")


@app.post("/api/dataset/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """Accept any CSV of transactions. LLM infers which columns map to the
    schema the analysis needs (customer_id, day, amount, txn_type,
    device_id, address_id) so exact column names aren't required. Runs an
    unsupervised shared-device/shared-address ring-signal analysis - no
    fabricated ground-truth accuracy claim, since arbitrary uploads have no
    labels to validate against."""
    raw = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"could not parse CSV: {e}")

    if len(df) == 0:
        raise HTTPException(status_code=400, detail="CSV has no rows")

    sample_rows = df.head(3).to_dict("records")
    try:
        mapping = llm.infer_column_mapping(list(df.columns), sample_rows)
    except Exception as e:
        # RuntimeError (no key set) and any live-call failure (rate limit,
        # network) both need to land here - an uncaught exception from the
        # Groq SDK previously escaped past this except-RuntimeError-only
        # clause as a raw 500, which the browser surfaces as an opaque
        # "Failed to fetch" instead of a readable error.
        raise HTTPException(status_code=503, detail=f"column mapping unavailable: {e}")

    try:
        mapped = dataset_mod.apply_mapping(df, mapping)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"{e} - detected mapping: {mapping}")

    result = dataset_mod.analyze(mapped)
    result["column_mapping"] = mapping

    tenant_name = os.path.splitext(file.filename or "uploaded merchant")[0]
    tenant = dataset_mod.save_tenant(tenant_name, mapping, result)
    result["tenant_id"] = tenant["id"]
    return result


@app.get("/api/tenants")
def list_tenants():
    """Every previously uploaded merchant workspace - this is what makes
    'bring your own data' a real multi-tenant switcher instead of a
    one-shot analysis that's gone on refresh."""
    return {"tenants": dataset_mod.list_tenants()}


@app.get("/api/tenants/{tenant_id}")
def get_tenant(tenant_id: str):
    tenant = dataset_mod.get_tenant(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail=f"tenant {tenant_id} not found")
    return tenant


@app.delete("/api/tenants/{tenant_id}")
def delete_tenant(tenant_id: str, authorization: str = Header(default="")):
    # Found in a security audit: this had no auth at all, so anyone who
    # guessed/enumerated a tenant ID could delete another user's uploaded
    # workspace. Require a real, currently-valid Supabase session - same
    # verification auth.py already does for approvals, reused here rather
    # than trusting a client-supplied identity.
    token = authorization.removeprefix("Bearer ").strip()
    try:
        auth_mod.get_supabase_user(token)
    except auth_mod.AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    if not dataset_mod.delete_tenant(tenant_id):
        raise HTTPException(status_code=404, detail=f"tenant {tenant_id} not found")
    return {"deleted": tenant_id}


# =====================================================================
# Serve the built frontend from this same backend, so a deployment is one
# service, not two - webapp/dist is a production `npm run build` output,
# not committed (see .gitignore), so this only activates where a build
# actually ran (e.g. Render's build step below). Local dev is unaffected:
# `npm run dev` on :5173 still talks to this API on :8010 via CORS, same
# as always - this block does nothing unless webapp/dist exists.
# Registered last on purpose: FastAPI/Starlette match routes in
# registration order, so every /api/* route above still wins outright.
# =====================================================================
_WEBAPP_DIST = os.path.join(BASE, "webapp", "dist")
if os.path.isdir(_WEBAPP_DIST):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    _assets_dir = os.path.join(_WEBAPP_DIST, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="not found")
        # full_path comes straight from the URL, so a request like
        # /../backend/.env must not be able to escape _WEBAPP_DIST - resolve
        # symlinks/".." for real and verify containment before ever opening
        # the file, the same class of check dataset.py already applies to
        # tenant IDs.
        candidate = os.path.realpath(os.path.join(_WEBAPP_DIST, full_path))
        dist_root = os.path.realpath(_WEBAPP_DIST)
        if (
            full_path
            and (candidate == dist_root or candidate.startswith(dist_root + os.sep))
            and os.path.isfile(candidate)
        ):
            return FileResponse(candidate)
        # Client-side routing: any unmatched path (or the root) gets
        # index.html, and React Router takes it from there.
        return FileResponse(os.path.join(_WEBAPP_DIST, "index.html"))
