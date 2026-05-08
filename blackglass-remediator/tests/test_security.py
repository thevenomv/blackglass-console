"""
Tests for the remediator's HMAC Approval Token verifier and
default-on enforcement behaviour.

Locks in the contract documented at
`docs/safety-model.md` § 5b — the matrix of (secret-set,
opt-out-set) inputs to enforcement decisions, plus the cross-check
of bound fields (rid / tid / dec / exp).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi import HTTPException

from app.core.security import (
    approval_token_enforcement_enabled,
    verify_approval_token,
)


SECRET = "x" * 48


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _mint(
    rid: str = "rec_abc",
    tid: str = "tnt_xyz",
    dec: str = "approve",
    act: str = "user_42",
    iat_offset: int = 0,
    ttl_seconds: int = 300,
    secret: str = SECRET,
) -> str:
    now = int(time.time()) + iat_offset
    payload = {
        "rid": rid,
        "tid": tid,
        "dec": dec,
        "act": act,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url(sig)}"


@pytest.fixture(autouse=True)
def _reset_env(monkeypatch):
    """Each test starts with a clean env so the default-on matrix is honest."""
    monkeypatch.delenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("REMEDIATOR_APPROVAL_TOKEN_OPTIONAL", raising=False)


# ---------------------------------------------------------------------------
# enforcement matrix
# ---------------------------------------------------------------------------


def test_enforcement_on_when_secret_set(monkeypatch) -> None:
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", SECRET)
    assert approval_token_enforcement_enabled() is True


def test_enforcement_off_when_explicitly_opt_out(monkeypatch) -> None:
    # No secret + explicit opt-out → enforcement OFF (legacy mode)
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_OPTIONAL", "1")
    assert approval_token_enforcement_enabled() is False


def test_enforcement_off_for_truthy_opt_out_values(monkeypatch) -> None:
    for val in ("true", "True", "yes", "ON", "1"):
        monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_OPTIONAL", val)
        assert approval_token_enforcement_enabled() is False, val


def test_enforcement_default_on_when_secret_missing_no_opt_out(monkeypatch) -> None:
    # Default behaviour is ON — verify_approval_token will then raise
    # 500 with a clear mis-config message on the first approve attempt
    # rather than silently degrading to "trust the API key alone".
    assert approval_token_enforcement_enabled() is True


def test_short_secret_raises_at_check_time(monkeypatch) -> None:
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", "tooshort")
    # The runtime error is raised lazily on first read of the secret —
    # approval_token_enforcement_enabled() is one such reader.
    with pytest.raises(RuntimeError, match=">=32 characters"):
        approval_token_enforcement_enabled()


# ---------------------------------------------------------------------------
# verify_approval_token attack matrix
# ---------------------------------------------------------------------------


def test_verify_happy_path(monkeypatch) -> None:
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", SECRET)
    payload = verify_approval_token(
        _mint(),
        expected_recommendation_id="rec_abc",
        expected_tenant_id="tnt_xyz",
        expected_decision="approve",
    )
    assert payload.rid == "rec_abc"
    assert payload.tid == "tnt_xyz"
    assert payload.dec == "approve"
    assert payload.act == "user_42"


def test_verify_rejects_recommendation_swap(monkeypatch) -> None:
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", SECRET)
    with pytest.raises(HTTPException) as exc:
        verify_approval_token(
            _mint(rid="rec_abc"),
            expected_recommendation_id="rec_OTHER",
            expected_tenant_id="tnt_xyz",
        )
    assert exc.value.status_code == 401


def test_verify_rejects_tenant_replay(monkeypatch) -> None:
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", SECRET)
    with pytest.raises(HTTPException) as exc:
        verify_approval_token(
            _mint(tid="tnt_xyz"),
            expected_recommendation_id="rec_abc",
            expected_tenant_id="tnt_OTHER",
        )
    assert exc.value.status_code == 401


def test_verify_rejects_decision_flip(monkeypatch) -> None:
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", SECRET)
    with pytest.raises(HTTPException) as exc:
        verify_approval_token(
            _mint(dec="reject"),
            expected_recommendation_id="rec_abc",
            expected_tenant_id="tnt_xyz",
            expected_decision="approve",
        )
    assert exc.value.status_code == 401


def test_verify_rejects_expired(monkeypatch) -> None:
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", SECRET)
    with pytest.raises(HTTPException) as exc:
        verify_approval_token(
            _mint(iat_offset=-3600, ttl_seconds=1),  # iat one hour ago, ttl 1s
            expected_recommendation_id="rec_abc",
            expected_tenant_id="tnt_xyz",
        )
    assert exc.value.status_code == 401


def test_verify_rejects_iat_too_far_in_future(monkeypatch) -> None:
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", SECRET)
    with pytest.raises(HTTPException) as exc:
        verify_approval_token(
            _mint(iat_offset=600),  # iat 10 minutes in the future
            expected_recommendation_id="rec_abc",
            expected_tenant_id="tnt_xyz",
        )
    assert exc.value.status_code == 401


def test_verify_rejects_signature_under_different_secret(monkeypatch) -> None:
    # Mint with one secret, verify with another — should reject.
    other = "y" * 48
    token = _mint(secret=other)
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", SECRET)
    with pytest.raises(HTTPException) as exc:
        verify_approval_token(
            token,
            expected_recommendation_id="rec_abc",
            expected_tenant_id="tnt_xyz",
        )
    assert exc.value.status_code == 401


@pytest.mark.parametrize("malformed", ["", ".", "abc.", ".xyz", "no-dot-at-all"])
def test_verify_rejects_malformed(monkeypatch, malformed: str) -> None:
    monkeypatch.setenv("REMEDIATOR_APPROVAL_TOKEN_SECRET", SECRET)
    with pytest.raises(HTTPException) as exc:
        verify_approval_token(
            malformed,
            expected_recommendation_id="rec_abc",
            expected_tenant_id="tnt_xyz",
        )
    assert exc.value.status_code == 401


def test_verify_500s_when_secret_unconfigured(monkeypatch) -> None:
    # Mis-config — explicitly NOT a 401, so the operator notices.
    with pytest.raises(HTTPException) as exc:
        verify_approval_token(
            _mint(),  # token signed with our test secret
            expected_recommendation_id="rec_abc",
            expected_tenant_id="tnt_xyz",
        )
    assert exc.value.status_code == 500
    assert "secret_not_configured" in str(exc.value.detail)
