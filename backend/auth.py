"""
Server-side approval verification.

Found during a security audit: POST /api/policy/approve took a raw
`approved_by` string from the client with no server-side check at all - a
direct API call could approve any policy version as anyone.

This module closes that gap for real: the Supabase access token is
verified server-side against Supabase's own /auth/v1/user endpoint (not
just trusted because the frontend sent it) before the backend mints a
short-lived, HMAC-signed approval token. /api/policy/approve now requires
that token instead of a free-text name, and reads the approver's identity
from the token's verified claims, never from client input.

Face-ID lives only on the login page (see webapp/src/pages/Login.tsx) -
this endpoint checks for a real, live Supabase session, not a biometric
match.
"""
import os
import time
import hmac
import hashlib
import base64
import json
import secrets

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://pitasanmfeumfmmloezz.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_t3lbR8vyvGLWVevyF1zfbA_8x4ejGdt")

# Regenerated on every process start if not set explicitly - fine for a
# hackathon demo (it just means outstanding tokens don't survive a backend
# restart, which is the safe failure direction). Set APPROVAL_TOKEN_SECRET
# in .env for a stable secret across restarts.
_TOKEN_SECRET = os.environ.get("APPROVAL_TOKEN_SECRET") or secrets.token_hex(32)

TOKEN_TTL_SECONDS = 120


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


def verify_session_and_mint_token(access_token: str) -> dict:
    """Approval identity check without the face-match step: face-ID stays
    only on the login page now, so approving just needs a live, server-
    verified Supabase session (the access token really does belong to a
    real signed-in user) before minting the short-lived approval token."""
    user = get_supabase_user(access_token)
    token = mint_approval_token(user["id"], user["email"])
    return {"token": token, "email": user["email"]}
