"""
Server-side approval verification.

Found during a security audit: POST /api/policy/approve took a raw
`approved_by` string from the client with no server-side check at all -
the README's "real Supabase sign-in + live face-api.js biometric match
required before approval registers" claim was only true inside the React
UI. A direct API call could approve any policy version as anyone.

This module closes that gap for real:
1. The Supabase access token is verified server-side against Supabase's
   own /auth/v1/user endpoint (not just trusted because the frontend sent
   it) - this proves who is asking.
2. The captured face descriptor is compared server-side, in this process,
   against the descriptor stored in Supabase for that exact user id - the
   backend does its own face-match math instead of trusting the browser's
   "it matched" claim.
3. Only if both check out does the backend mint a short-lived, HMAC-signed
   approval token. /api/policy/approve now requires that token instead of
   a free-text name, and reads the approver's identity from the token's
   verified claims, never from client input.

Fails closed: if SUPABASE_SERVICE_ROLE_KEY isn't configured, approval-token
issuance is refused outright (503) rather than silently skipping the face
check.
"""
import os
import time
import hmac
import hashlib
import base64
import json
import secrets

import numpy as np
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://pitasanmfeumfmmloezz.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_t3lbR8vyvGLWVevyF1zfbA_8x4ejGdt")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# Regenerated on every process start if not set explicitly - fine for a
# hackathon demo (it just means outstanding tokens don't survive a backend
# restart, which is the safe failure direction). Set APPROVAL_TOKEN_SECRET
# in .env for a stable secret across restarts.
_TOKEN_SECRET = os.environ.get("APPROVAL_TOKEN_SECRET") or secrets.token_hex(32)

TOKEN_TTL_SECONDS = 120
MATCH_THRESHOLD = 0.6


class AuthError(Exception):
    pass


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def get_supabase_user(access_token: str) -> dict:
    """Ask Supabase itself who this access token belongs to - never trust
    a client-supplied user id or email directly."""
    if not access_token:
        raise AuthError("missing access token")
    resp = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={"Authorization": f"Bearer {access_token}", "apikey": SUPABASE_ANON_KEY},
        timeout=10,
    )
    if resp.status_code != 200:
        raise AuthError("invalid or expired session - please sign in again")
    user = resp.json()
    if not user.get("id") or not user.get("email"):
        raise AuthError("could not resolve identity from session")
    return {"id": user["id"], "email": user["email"]}


def fetch_stored_face_descriptor(user_id: str) -> list[float] | None:
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise AuthError(
            "server-side approval verification is not configured "
            "(SUPABASE_SERVICE_ROLE_KEY missing in backend/.env) - refusing to approve"
        )
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/profiles",
        params={"id": f"eq.{user_id}", "select": "face_descriptor"},
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        timeout=10,
    )
    if resp.status_code != 200:
        raise AuthError("could not look up enrolled face profile")
    rows = resp.json()
    if not rows or not rows[0].get("face_descriptor"):
        return None
    return rows[0]["face_descriptor"]


def mint_approval_token(user_id: str, email: str) -> str:
    payload = {"uid": user_id, "email": email, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    body = _b64url(json.dumps(payload).encode())
    sig = _b64url(hmac.new(_TOKEN_SECRET.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_approval_token(token: str) -> dict:
    try:
        body, sig = token.split(".")
    except (ValueError, AttributeError):
        raise AuthError("malformed approval token")
    expected_sig = _b64url(hmac.new(_TOKEN_SECRET.encode(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected_sig):
        raise AuthError("invalid approval token - it may have been tampered with")
    payload = json.loads(_b64url_decode(body))
    if payload["exp"] < time.time():
        raise AuthError("approval token expired - please verify your identity again")
    return payload


def verify_face_and_mint_token(access_token: str, captured_descriptor: list[float]) -> dict:
    """The real, server-side version of the check the browser already did
    client-side for UX responsiveness. This is the one that actually
    counts: it re-fetches the enrolled descriptor and re-computes the
    match in this process, so a modified or scripted client can't just
    claim a match happened."""
    user = get_supabase_user(access_token)
    stored = fetch_stored_face_descriptor(user["id"])
    if stored is None:
        raise AuthError("no enrolled face found for this account")
    if len(captured_descriptor) != len(stored):
        raise AuthError("face descriptor shape mismatch")

    distance = float(np.linalg.norm(np.array(captured_descriptor) - np.array(stored)))
    if distance >= MATCH_THRESHOLD:
        raise AuthError(f"face does not match this account (distance {distance:.3f})")

    token = mint_approval_token(user["id"], user["email"])
    return {"token": token, "email": user["email"], "distance": distance}
