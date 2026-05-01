#!/usr/bin/env python3
"""
Apply Stage 0 console settings on an existing DigitalOcean App Platform app via API.

Requires:
  DIGITALOCEAN_ACCESS_TOKEN — Personal Access Token with App read/write scope.

Optional:
  BLACKGLASS_APP_ID — app UUID (if omitted, picks first app whose spec name is "blackglass")
  AUTH_SESSION_SECRET — if set, uses this value for a new secret entry; if omitted and
    the app has no AUTH_SESSION_SECRET yet, generates a URL-safe random value.

Does not print secret values. On first run, prints whether a new session secret was added
(so you know to save it if you ever need to rotate manually).

Usage:
  export DIGITALOCEAN_ACCESS_TOKEN=...
  python scripts/do_apply_stage0.py

  # Windows PowerShell:
  $env:DIGITALOCEAN_ACCESS_TOKEN = "dpat_..."
  python scripts/do_apply_stage0.py
"""

from __future__ import annotations

import json
import os
import secrets
import sys
import urllib.error
import urllib.request

BASE = "https://api.digitalocean.com/v2"


def http(method: str, path: str, payload: dict | None = None) -> dict:
    token = os.environ.get("DIGITALOCEAN_ACCESS_TOKEN")
    if not token:
        raise SystemExit("DIGITALOCEAN_ACCESS_TOKEN is not set.")
    url = f"{BASE}{path}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed ({e.code}): {err}") from e


def find_blackglass_app_id() -> str:
    apps = http("GET", "/apps?per_page=200").get("apps", [])
    for a in apps:
        spec = a.get("spec") or {}
        if spec.get("name") == "blackglass":
            return a["id"]
    raise SystemExit(
        'No app with spec.name "blackglass" found. Set BLACKGLASS_APP_ID to your app UUID.'
    )


def ensure_stage0_envs(web_envs: list[dict]) -> tuple[list[dict], bool]:
    """
    Returns (new_envs, added_new_session_secret).
    Preserves existing AUTH_SESSION_SECRET entries (including DO encrypted values).
    """
    by_key: dict[str, dict] = {}
    order: list[str] = []
    seen: set[str] = set()

    for e in web_envs:
        k = e.get("key")
        if not k or k in seen:
            continue
        seen.add(k)
        order.append(k)
        by_key[k] = dict(e)

    # Stage 0: require auth (plain env, not SECRET)
    cur = dict(by_key.get("AUTH_REQUIRED") or {})
    cur["key"] = "AUTH_REQUIRED"
    cur["scope"] = "RUN_TIME"
    cur["value"] = "true"
    cur["type"] = "GENERAL"
    by_key["AUTH_REQUIRED"] = cur
    if "AUTH_REQUIRED" not in seen:
        seen.add("AUTH_REQUIRED")
        order.append("AUTH_REQUIRED")

    added_secret = False
    if "AUTH_SESSION_SECRET" not in by_key:
        raw = os.environ.get("AUTH_SESSION_SECRET") or secrets.token_urlsafe(48)
        by_key["AUTH_SESSION_SECRET"] = {
            "key": "AUTH_SESSION_SECRET",
            "scope": "RUN_TIME",
            "type": "SECRET",
            "value": raw,
        }
        if "AUTH_SESSION_SECRET" not in seen:
            seen.add("AUTH_SESSION_SECRET")
            order.append("AUTH_SESSION_SECRET")
        added_secret = True

    new_list = [by_key[k] for k in order]
    return new_list, added_secret


def main() -> None:
    app_id = os.environ.get("BLACKGLASS_APP_ID") or find_blackglass_app_id()
    body = http("GET", f"/apps/{app_id}")
    app = body.get("app")
    if not app:
        raise SystemExit(f"Unexpected GET /apps/{app_id} response")

    spec = app["spec"]
    services = spec.get("services") or []
    web = None
    for svc in services:
        if svc.get("name") == "web":
            web = svc
            break
    if not web:
        raise SystemExit('No service named "web" in app spec')

    envs = list(web.get("envs") or [])
    new_envs, added_new = ensure_stage0_envs(envs)
    web["envs"] = new_envs

    print(f"PUT /v2/apps/{app_id} (Stage 0: AUTH_REQUIRED=true, AUTH_SESSION_SECRET...)")
    http("PUT", f"/apps/{app_id}", {"spec": spec})

    print("Update submitted. DigitalOcean will deploy App spec changes.")
    if added_new:
        print(
            "A new AUTH_SESSION_SECRET was added (value was not printed). "
            "To set your own next time, export AUTH_SESSION_SECRET before running this script."
        )
    else:
        print("Existing AUTH_SESSION_SECRET left unchanged.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        raise SystemExit(1) from e
