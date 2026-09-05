"""
Groq LLM integration for Risk Autopsy.

Two real jobs for the LLM, both grounded in the actual computed pipeline
output (never asked to invent numbers):

1. Narrative autopsy - turns the raw feature/policy JSON for one customer
   into a human-readable investigation writeup a reviewer can actually read.
2. Grounded chat - answers a reviewer's free-text question about the
   currently loaded dashboard data, with that data injected as context.

Also: LLM-assisted column mapping for arbitrary uploaded CSVs (see
dataset.py), so "any dataset" doesn't require exact column names.

If GROQ_API_KEY isn't set, every function here raises a clear 503 rather
than silently faking a response - the dashboard degrades gracefully by
falling back to the old template text.
"""
import os
import json
from groq import Groq

MODEL = "openai/gpt-oss-120b"


def _client() -> Groq:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY not set - add it to backend/.env")
    return Groq(api_key=key)


def describe_error(e: Exception) -> str:
    """A short, human-readable summary of an LLM-call failure for display
    in the UI - the Groq SDK's str(e) on a RateLimitError is a raw nested
    dict repr several lines long, which reads as a broken app rather than
    an honest degraded state when shown directly to a reviewer."""
    name = type(e).__name__
    if name == "RateLimitError":
        return "the AI provider's daily quota is exhausted for now"
    if name in ("APIConnectionError", "APITimeoutError"):
        return "could not reach the AI provider (network/timeout)"
    if name == "AuthenticationError":
        return "the configured API key was rejected"
    return f"AI call failed ({name})"


_MOJIBAKE_FIXES = {
    "â€‘": "-", "â€’": "-",  # en/em dash occasionally mis-decoded as UTF-8-in-Latin-1
    "â€“": "-", "â€”": "-",
    "â€™": "'", "â€œ": '"', "â€�": '"',
}


def _clean_text(text: str) -> str:
    for bad, good in _MOJIBAKE_FIXES.items():
        text = text.replace(bad, good)
    return text


def generate_narrative(autopsy: dict) -> str:
    """One customer's autopsy JSON -> a short investigation narrative."""
    prompt = f"""You are a fraud investigator writing a short case note for a colleague.
Below is the REAL computed data for one customer from an abuse-ring detection
pipeline. Write a 3-5 sentence narrative explaining what happened, grounded
ONLY in these numbers - do not invent transactions, amounts, or dates that
aren't in the data. Be direct and specific (cite actual day numbers and
amounts from the timeline). No preamble, no markdown headers.

DATA:
{json.dumps(autopsy, indent=2)}
"""
    resp = _client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=300,
    )
    return _clean_text(resp.choices[0].message.content.strip())


def chat_answer(question: str, context: dict, history: list[dict]) -> str:
    """Answer a reviewer's question, grounded in the current dashboard's
    real computed data (overview, policy comparison, adversarial results,
    off-policy eval, portfolio conflict - whatever's loaded)."""
    system = f"""You are the Risk Autopsy assistant, embedded in a fraud-policy
review dashboard. Answer the reviewer's questions using ONLY the DASHBOARD
DATA below - it is the real, currently-computed output of the pipeline. If
something isn't in the data, say so instead of guessing. Keep answers short
(2-4 sentences) and concrete - cite actual numbers.

All currency amounts in the data are in Indian Rupees - always use the ₹ symbol 
(e.g. "₹14.6M" or "₹14,63,002"), never $ or USD, and never claim the data is in dollars.

DASHBOARD DATA:
{json.dumps(context, indent=2)[:6000]}
"""
    messages = [{"role": "system", "content": system}]
    for turn in history[-6:]:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": question})

    resp = _client().chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.2,
        max_tokens=350,
    )
    return _clean_text(resp.choices[0].message.content.strip())


def annotate_blast_radius(rows: list[dict]) -> list[dict]:
    """For each customer whose verdict flips and who's flagged as worth a
    human's attention (see src/blast_radius.py), have the LLM write a
    one-line reason it's worth a second look - grounded in that row's real
    feature values only."""
    if not rows:
        return []
    prompt = f"""You are helping a fraud reviewer triage a policy change. Below is a
JSON list of customers whose flag status just changed between the old and
new policy, and who were pre-selected as worth a second look (a newly-flagged
customer who ISN'T a known abuser, or a newly-cleared customer who IS).

For each customer, write a ONE-SENTENCE reason a human should specifically
look at this one, grounded only in their actual feature values below - do
not invent facts. Be concrete (cite the actual numbers).

All currency amounts (max_amount, loss_rs) are in Indian Rupees - always
use the ₹ symbol (e.g. "₹7,928"), never $ or USD.

DATA:
{json.dumps(rows, indent=2)}

Respond with ONLY a JSON object {{"notes": {{"<customer_id>": "<one sentence>", ...}}}}
for every customer_id above. No explanation outside the JSON."""
    resp = _client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    notes = json.loads(resp.choices[0].message.content).get("notes", {})
    return [{**r, "review_note": _clean_text(notes.get(str(r["customer_id"]), ""))} for r in rows]


def generate_customer_letter(row: dict) -> str:
    """A customer-facing explanation for one blast-radius flip - not the
    internal reviewer note (annotate_blast_radius above, written FOR a
    fraud analyst using internal jargon like escalation_ratio), but a
    plain-language letter a real customer could actually receive, grounded
    only in that customer's real feature values.

    This is deliberately the opposite tone of the internal review note:
    no feature names, no ring-detection language, no accusation - just a
    factual, dignified account-status explanation. Regulators in several
    jurisdictions (e.g. FCRA-adjacent adverse-action-notice norms) expect
    exactly this kind of specific, non-jargon reasoning when an automated
    decision affects someone's account, which is a real reason this
    capability belongs next to a compliance dossier feature, not just a
    nice-to-have."""
    verdict = "flagged for additional review" if row["flip"] == "newly_flagged" else "cleared from additional review"
    prompt = f"""Write a short, plain-language, professional letter (3-4 sentences) to a
customer whose account has just been {verdict} by an automated risk policy update.

Ground it ONLY in these real facts about their account - do not invent
anything, do not use internal jargon (no "escalation ratio", "ring", "sharing
signal" etc. - translate to plain language like "recent purchase pattern" or
"account activity"), and do not accuse them of wrongdoing even if internal
data suggests risk - state facts about what changed, not conclusions about intent:

{json.dumps(row, indent=2)}

If flip is "newly_flagged": explain that a routine policy update means their
account will see additional review on future transactions, and that this is
not a final determination. If "newly_cleared": explain that a routine policy
update has removed a prior review flag from their account.

All currency amounts are in Indian Rupees - always use the ₹ symbol (e.g.
"₹47,847"), never $ or USD, regardless of the number's magnitude.

Sign off as "Risk & Trust Team". Output ONLY the letter body, no subject line, no explanation."""
    # Bug found while building this: with the multi-constraint prompt above
    # (jargon-avoidance, tone, grounding rules all at once), gpt-oss-120b -
    # a reasoning model - sometimes burns its entire token budget on internal
    # deliberation and returns finish_reason="length" with an EMPTY content
    # field, having never gotten to the actual answer. reasoning_effort="low"
    # plus headroom in max_tokens fixes it; verified empty-content responses
    # stop happening under the same prompt that reproduced it originally.
    resp = _client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=600,
        reasoning_effort="low",
    )
    text = resp.choices[0].message.content
    if not text:
        raise RuntimeError(
            f"LLM returned no content (finish_reason={resp.choices[0].finish_reason}) - try again"
        )
    return _clean_text(text.strip())


CANONICAL_COLUMNS = {
    "customer_id": "unique identifier for the customer/account",
    "day": "integer day index or timestamp of the transaction",
    "amount": "transaction amount, numeric",
    "txn_type": "type of transaction, e.g. purchase or chargeback/refund",
    "device_id": "device fingerprint or identifier used for the transaction",
    "address_id": "shipping/billing address identifier",
}


def infer_column_mapping(columns: list[str], sample_rows: list[dict]) -> dict:
    """Map an arbitrary uploaded CSV's columns onto the canonical schema
    the pipeline expects. Returns {canonical_name: source_column_or_None}."""
    prompt = f"""An uploaded CSV has these columns: {columns}
Here are 3 sample rows: {json.dumps(sample_rows[:3], default=str)}

Map each of these canonical fields to the best-matching source column name,
or null if there is no reasonable match:
{json.dumps(CANONICAL_COLUMNS, indent=2)}

Respond with ONLY a JSON object like {{"customer_id": "<source column or null>", ...}}
for exactly these keys: {list(CANONICAL_COLUMNS.keys())}. No explanation."""
    resp = _client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=200,
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content)


# Every dashboard section id the chat's command layer is allowed to scroll
# to. Kept in sync by hand with webapp/src/components/Sidebar.tsx's section
# list - there's no shared source of truth across the Python/TypeScript
# boundary, so a renamed section on the frontend needs updating here too.
_VALID_SECTION_IDS = [
    "sec-1", "sec-2", "sec-3", "sec-4", "sec-4-5", "sec-4-6", "sec-4-7",
    "sec-4-8", "sec-4-9", "sec-4-10", "sec-4-11", "sec-4-12", "sec-4-13",
    "sec-4-14", "sec-4-15", "sec-5", "sec-6",
]
_VALID_INTENTS = ("navigate", "retrain", "run_agent", "chat")


def classify_command_intent(text: str) -> dict:
    """Classifies free text (typed or voice-transcribed) into one of a fixed
    set of actions this app can actually perform, or 'chat' if it's just a
    question or conversation. Used as a smarter fallback when the frontend's
    client-side keyword matcher doesn't recognize a phrasing.

    The safety boundary here is structural, not a prompt instruction the
    model could be argued out of: 'approve' and 'deploy' are not members of
    the intent enum at all, so there is no valid output this function can
    ever produce that authorizes one - same as the rest of this app, where
    the LLM proposes and code (here, a fixed whitelist) verifies. The
    section_id is independently re-validated against the real list below
    regardless of what the model returns, exactly like every other LLM
    output in this project is checked rather than trusted."""
    system = f"""Classify the user's message into exactly one intent for a fraud-risk
policy dashboard. Respond ONLY with JSON: {{"intent": "navigate" | "retrain" | "run_agent" | "chat", "section_id": string or null}}

Rules:
- "navigate": user wants to see or scroll to a specific dashboard section.
  Pick section_id from EXACTLY this list, no other value: {_VALID_SECTION_IDS}
  If they mean the first/top section use "sec-1"; the last/final section use "sec-6".
- "retrain": user wants to retrain or train a new policy candidate.
- "run_agent": user wants to run the autonomous risk policy engineer.
- "chat": anything else - questions about the data, greetings, small talk,
  or a request to approve/deploy/activate/publish a policy. This app never
  does that from chat, by design - there is no intent for it, so classify
  those as "chat" and the reply will explain why, not attempt it.
section_id must be null unless intent is "navigate"."""

    try:
        resp = _client().chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": text}],
            temperature=0,
            # Generous on purpose: the system prompt has to restate the full
            # section-id list, and a model that runs out of budget mid-JSON
            # produces invalid JSON, not a short valid one - a hard failure
            # (see the broad except below), not a graceful truncation.
            max_tokens=200,
            response_format={"type": "json_object"},
        )
    except RuntimeError:
        raise  # no GROQ_API_KEY - let the caller's existing 503 handling report this
    except Exception:
        # Any other Groq-side failure (bad request, JSON validation, rate
        # limit, network) - degrade to "chat" exactly like every other AI
        # feature in this app degrades when Groq misbehaves, rather than
        # crashing the request. Voice/typed commands still work via the
        # client-side keyword matcher regardless of this endpoint's health.
        return {"intent": "chat", "section_id": None}

    try:
        parsed = json.loads(resp.choices[0].message.content)
    except (json.JSONDecodeError, TypeError, AttributeError):
        return {"intent": "chat", "section_id": None}

    intent = parsed.get("intent")
    if intent not in _VALID_INTENTS:
        intent = "chat"
    section_id = parsed.get("section_id")
    if intent != "navigate" or section_id not in _VALID_SECTION_IDS:
        section_id = None
    return {"intent": intent, "section_id": section_id}
