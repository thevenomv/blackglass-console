#!/usr/bin/env python3
"""
Create BLACKGLASS on DigitalOcean App Platform and attach it to your DO Project.

Prerequisites (one-time):
  1) Export DIGITALOCEAN_ACCESS_TOKEN (Personal Access Token with App write scope).
  2) GitHub: grant the DigitalOcean GitHub App access to your repository
     (GitHub -> Settings -> Applications -> DigitalOcean App Platform -> Configure -> Repository access).
     Optional: BLACKGLASS_GITHUB_REPO=your-org/your-repo overrides the template in `.do/app-create.phase1.json`.

Phase 1 POST uses NEXT_PUBLIC_USE_MOCK=true so SSR works before NEXT_PUBLIC_APP_URL is known.
After the app has a live URL, this script PUTs the spec with NEXT_PUBLIC_APP_URL=<live> and USE_MOCK=false,
then assigns the app to your Blackglass DO Project.

Optional env:
  BLACKGLASS_GITHUB_REPO — "owner/repo" for DO’s GitHub component (forks)
  BLACKGLASS_DO_PROJECT_ID (default: Blackglass project UUID below)
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://api.digitalocean.com/v2"
DEFAULT_PROJECT_ID = "2081c029-849a-4286-8b19-27717a597258"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PHASE1 = os.path.join(ROOT, ".do", "app-create.phase1.json")


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


def main() -> None:
    if not os.path.isfile(PHASE1):
        raise SystemExit(f"Missing {PHASE1}")

    with open(PHASE1, encoding="utf-8") as f:
        create_body = json.load(f)

    repo_override = os.environ.get("BLACKGLASS_GITHUB_REPO", "").strip()
    if repo_override:
        for svc in create_body.get("spec", {}).get("services", []):
            gh = svc.get("github")
            if isinstance(gh, dict):
                gh["repo"] = repo_override
        print(f"Using BLACKGLASS_GITHUB_REPO={repo_override!r} for GitHub component")

    print("POST /v2/apps (phase 1: mock data enabled)...")
    try:
        created = http("POST", "/apps", create_body)
    except RuntimeError as e:
        msg = str(e)
        print(msg, file=sys.stderr)
        if "GitHub user does not have access" in msg:
            ref = (
                repo_override
                if repo_override
                else "the `repo` in `.do/app-create.phase1.json` (export BLACKGLASS_GITHUB_REPO=owner/repo for forks)"
            )
            print(
                "\nFix: GitHub -> Settings -> Applications -> DigitalOcean App Platform -> Configure,\n"
                f"then add repository access for {ref!r} (or grant access to all repositories).\n",
                file=sys.stderr,
            )
        raise SystemExit(1)

    app_id = created["app"]["id"]
    print(f"Created app id={app_id}")

    live = None
    for i in range(120):
        app = http("GET", f"/apps/{app_id}")["app"]
        live = app.get("live_url")
        active = (app.get("active_deployment") or {}).get("phase")
        pending = (app.get("pending_deployment") or {}).get("phase")
        print(f"poll {i}: live_url={live!r} active={active!r} pending={pending!r}")
        if live and active == "ACTIVE":
            break
        time.sleep(15)
    else:
        raise SystemExit("Timed out waiting for ACTIVE deployment / live_url.")

    live = live.rstrip("/")
    print(f"Live URL: {live}")

    app = http("GET", f"/apps/{app_id}")["app"]
    spec = app["spec"]

    for svc in spec.get("services", []):
        if svc.get("name") == "web":
            svc["envs"] = [
                {"key": "NODE_ENV", "value": "production", "scope": "RUN_AND_BUILD_TIME"},
                {"key": "NEXT_PUBLIC_APP_URL", "value": live, "scope": "RUN_AND_BUILD_TIME"},
                {"key": "NEXT_PUBLIC_USE_MOCK", "value": "false", "scope": "RUN_AND_BUILD_TIME"},
                {"key": "NEXT_PUBLIC_API_URL", "value": "", "scope": "RUN_AND_BUILD_TIME"},
                {"key": "AUTH_REQUIRED", "value": "false", "scope": "RUN_TIME"},
            ]

    print("PUT /v2/apps/{id} (phase 2: real URLs + live API mode)...")
    http("PUT", f"/apps/{app_id}", {"spec": spec})

    project_id = os.environ.get("BLACKGLASS_DO_PROJECT_ID", DEFAULT_PROJECT_ID)
    print(f"POST /v2/projects/{project_id}/resources (attach app to DO Project)...")
    try:
        http(
            "POST",
            f"/projects/{project_id}/resources",
            {"resources": [f"do:app:{app_id}"]},
        )
    except RuntimeError as e:
        print(f"Warning: could not assign project automatically: {e}", file=sys.stderr)

    print("\nDone.")
    print(f"App id: {app_id}")
    print(f"URL:    {live}")
    print("Smoke:  curl -fsS {}/api/health".format(live))


if __name__ == "__main__":
    main()
