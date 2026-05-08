# Remediator safety model

> Version: 1.1 · Last reviewed: 2026-05-08
> Audience: security reviewers, buyers, on-call operators.

This document is the **definitive statement** of how the BLACKGLASS Remediator
keeps AI-generated remediation plans safe to deploy in production environments.
Read this before approving the remediator for use against any real fleet.

---

## TL;DR (the one promise)

> **The remediator never runs AI-generated commands directly on production
> hosts. Every plan is either guidance only, sandbox-verified in a throwaway
> VM, or held for explicit human approval — and forbidden command patterns
> are blocked in code, not in the prompt.**

If you only read one paragraph of this doc, that is it.

---

## End-to-end HITL flow

```
                ┌──────────────────────────────────────────────────────────┐
                │ BLACKGLASS Console (Next.js)                             │
                │                                                          │
   drift event  │  scan-worker                                             │
  ───────────►  │      │                                                   │
                │      ▼                                                   │
                │  drift_engine.ts                                         │
                │      │                                                   │
                │      ▼   POST /api/v1/remediations                       │
                │  remediator HTTP client ─────────────┐                   │
                └──────────────────────────────────────┼───────────────────┘
                                                       │  HMAC webhook sig
                                                       ▼
                ┌──────────────────────────────────────────────────────────┐
                │ Remediator (Python / FastAPI sidecar)                    │
                │                                                          │
                │  classify_policy_tier()  ◄── HARD-CODED (not in prompt)  │
                │      │                                                   │
                │      ▼                                                   │
                │  RemediationAgent.plan()  ◄── LLM (Ollama, read-only)    │
                │      │                                                   │
                │      ▼                                                   │
                │  apply_confidence_cap()  ◄── per-category ceiling        │
                │      │                                                   │
                │      ▼                                                   │
                │  escalate_tier_for_commands()  ◄── sudo / sshd auto-up   │
                │      │                                                   │
                │      ▼                                                   │
                │  is_command_forbidden()  ◄── DENY-LIST blocks plan       │
                │      │                                                   │
                │      ▼                                                   │
                │  ┌── sandbox? ──┐                                        │
                │  │   YES        │                                        │
                │  ▼              │                                        │
                │ ephemeral DO    │                                        │
                │ droplet         │                                        │
                │  │              │                                        │
                │  ▼              ▼                                        │
                │ verify pass ──► AWAITING_APPROVAL                        │
                │                  │                                       │
                └──────────────────┼───────────────────────────────────────┘
                                   │  callback POST /api/v1/remediations
                                   ▼
                ┌──────────────────────────────────────────────────────────┐
                │ BLACKGLASS Console — Drift detail UI                     │
                │                                                          │
                │  RemediationRecommendation.tsx                           │
                │   ├─ confidence band (green/amber/red), capped badge     │
                │   ├─ tier badge + "tier escalated from commands" hint    │
                │   ├─ proposed commands (read-only)                       │
                │   └─ Approve / Reject buttons                            │
                │                                                          │
                │      ▼ operator clicks Approve                           │
                │                                                          │
                │  POST /api/v1/remediations/{id}/approve                  │
                │      │   1. requireSaasOrLegacyPermission(drift.manage)  │
                │      │   2. setRemediationStatus(...) + audit            │
                │      │   3. mint HMAC Approval Token                     │
                │      ▼                                                   │
                │  X-Blackglass-Approval-Token: <payload>.<sig>            │
                └──────────────────┬───────────────────────────────────────┘
                                   │  POST + HMAC webhook + Approval Token
                                   ▼
                ┌──────────────────────────────────────────────────────────┐
                │ Remediator                                               │
                │                                                          │
                │  verify_approval_token(token,                            │
                │      expected_recommendation_id, expected_tenant_id,     │
                │      expected_decision="approve")                        │
                │      │   401 on any mismatch (rid, tid, dec, exp, sig)   │
                │      ▼                                                   │
                │  ApprovalService.approve()                               │
                │      │                                                   │
                │      ▼                                                   │
                │  audit row + status=APPROVED                             │
                │                                                          │
                │  ⚠  No further automated step. The console writes the    │
                │     approval; an operator (or the customer's existing    │
                │     change-management pipeline) is responsible for       │
                │     actually executing the approved commands. The        │
                │     remediator's promise is "AI reasons, humans          │
                │     decide AND act."                                     │
                └──────────────────────────────────────────────────────────┘
```

The two human gates (clicking Approve in the UI, then someone actually
running the commands) plus the four code-enforced gates (tier
classification, confidence cap, command escalation, forbidden-pattern
denylist) plus the HMAC Approval Token are independently audit-able and
can be reasoned about without reading any prompt text.

---

## 1. Risk-tier model (the hard-coded gatekeeper)

Every drift event the remediator receives is classified into one of four
tiers by `app/agent/risk_policy.py::classify_policy_tier()`. **Classification
is application logic — not prompt instructions to the LLM.** The LLM cannot
see, override, or argue with the tier assignment.

| Tier                       | What the remediator does                                                                                                                                                       | What the operator sees                       | Categories that always land here                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `safe_guidance_only`       | Generate human-readable advice. **No commands surfaced.**                                                                                                                      | A "what we'd suggest" paragraph.             | Default fallback. In practice this captures `persistence` and `other` at low/medium severity (anything that does not qualify for a higher tier).                                                                                                       |
| `sandbox_verifiable`       | Generate plan, run it inside an ephemeral sandbox VM, capture results.                                                                                                          | "Verified in sandbox: X passed / Y failed."  | `packages`, `filesystem`, `systemd`, `cron`, `firewall`, `network_exposure` at low **or** medium severity.                                                                                                                                             |
| `approval_required`        | Generate plan, sandbox-verify (when `ENABLE_SANDBOX_VERIFICATION=true`), then **wait for explicit human click**.                                                                | An "Approve" / "Reject" UI with full audit.  | `ssh`, `authorized_keys`, `privilege_escalation`, `identity` (any severity). Plus any other category at `high` severity.                                                                                                                               |
| `manual_only`              | Refuse to generate any commands at all.                                                                                                                                         | "Investigate manually" placeholder.          | `kernel` (always — kernel changes are too situational for an LLM to reason about safely). The manual-only check is evaluated **before** the always-approval check, so kernel never reaches the approval tier even though it appears in both sets.       |

The decision tree (see `risk_policy.py::classify_policy_tier()`):

1. **Manual-only categories override everything else.** Kernel drift is
   never automated.
2. **Always-approval categories override severity.** SSH, identity,
   privilege escalation, and authorized_keys always require a human
   click, even for "low" findings.
3. **High severity always requires approval**, regardless of category.
4. **Medium severity in sandboxable categories** is sandbox-verified.
5. **Low severity in sandboxable categories** is also sandbox-verified
   (the workflow then surfaces verified results to the operator).
6. **Anything else** falls back to guidance only.

### Auto-escalation when the agent proposes risky verbs

The category-based tier is the *floor* — the actual commands the LLM
proposed are inspected by `escalate_tier_for_commands()` in
`risk_policy.py`. If any command contains `sudo `, `systemctl stop`,
`systemctl disable`, `systemctl mask`, an SSH-service restart/reload,
`usermod`, `passwd`, `groupmod`, or `visudo`, the tier is bumped from
`sandbox_verifiable` to `approval_required`. The escalation is logged
on the audit trail (`tier_escalated: sandbox_verifiable -> approval_required due_to=[sudo,...]`)
and surfaced in the UI as an explanation for why an otherwise
sandboxable change wants a human click.

The point: "category" tells us how scary the *intent* is; the verb
inspection tells us how scary the *implementation* is. Either signal
can move the tier up; neither can move it down.

### Why blast radius is enforced in code

LLMs are excellent at generating plausible-looking commands and very bad
at understanding "blast radius." If we asked the LLM "is this safe enough
to run automatically?", we would be one prompt-injection away from
`rm -rf /`. Instead, we hard-code the risk tier in Python and treat the
LLM purely as a content generator.

If you want to verify this independently, grep for `requires_human_approval`:

```bash
grep -rn requires_human_approval blackglass-remediator/
```

It is hard-coded `True` in every code path that surfaces commands.

---

## 2. Forbidden-command registry (defense in depth)

Even when the policy tier permits commands, **every generated command is
filtered through a deny-list** before being shown to a human. See
`app/agent/risk_policy.py::FORBIDDEN_COMMAND_PATTERNS` for the full list;
the categories covered are:

- **Filesystem destruction** — `rm -rf /`, `dd if=/dev/`, `mkfs.`,
  `> /dev/sda`.
- **Remote execution from untrusted sources** — `curl | bash`,
  `wget | sh`, `bash <(...)`, `sh <(...)`.
- **Permission free-for-all** — `chmod -R 777 /`, `chmod -R 777 /*`.
- **Firewall takedown** — `iptables -F`, `ufw disable`, `ufw reset`.
- **Root account compromise** — `userdel root`, `passwd root`,
  `chsh root`, sudoers truncation.
- **SSH service takedown** — `pkill -9 sshd`, `systemctl stop sshd`,
  `service ssh stop` (we will never disconnect the operator's own
  control plane).
- **SELinux disable** — `setenforce 0`.

Pattern matching is case-insensitive and substring-based. A plan that
contains *any* forbidden pattern is rejected wholesale — we don't try to
"sanitise" it, because partial cleansing is exactly the kind of subtle
mistake that costs availability.

When a forbidden pattern is detected:

1. The plan is dropped before reaching the operator UI.
2. An audit event `remediation.plan_rejected_forbidden` is emitted with
   the pattern that matched.
3. The drift event lifecycle stays `triaged` — it does **not** get
   marked `remediated` or `accepted_risk` automatically.

---

## 3. Sandbox verification (no impact on production)

Plans that fall into `sandbox_verifiable` (or higher tiers, which also go
through sandbox before approval) are executed in an **ephemeral
DigitalOcean droplet** that is:

- Created on demand from a known-good Ubuntu 22.04 image.
- **Outside the customer's network** — it has no SSH access to any
  production host, no production credentials, and no inbound firewall
  exceptions.
- Pre-loaded with the *drift state* (e.g. the offending package is
  installed, the bad permission is set) so the remediation plan operates
  on a representative target.
- Destroyed within 10 minutes of the verification run, or sooner on
  exception. The destruction call is in a `finally` block — see
  `app/sandbox/droplet.py::destroy_sandbox()`.

The verification run captures:

- Each command's `exit_code`, `stdout`, `stderr`.
- Whether each `verification_check` (a read-only command the LLM proposes
  to assert success) passed.
- Total runtime.

A plan can fail verification by hanging (timeout), erroring (non-zero
exit), or returning a `verification_check` that doesn't match the
expected output. **Failed verification means the plan never reaches the
operator** — the lifecycle stays `triaged` and an audit row is emitted.

---

## 4. Confidence scoring

Every plan ships with a `confidence_score` in the range `0.0–1.0`. It is
computed from the LLM's self-reported certainty plus the verification
result (sandbox pass = +0.2, partial pass = +0.0, fail = the plan is
discarded before scoring). The console refuses to surface plans below
the configured threshold (`REMEDIATOR_MIN_CONFIDENCE`, default `0.7`)
even if they pass verification — this lets operators tune how cautious
the surface area is on day one.

---

## 5. Human-in-the-loop UI contract

For **every** plan that reaches the console:

- The drift detail page shows the original drift event, the proposed
  plan (each command with its rationale), the sandbox verification
  output, and the confidence score.
- The "Approve" button requires:
  - The operator to be authenticated (Clerk session or API key with the
    `remediations.approve` permission).
  - The drift event lifecycle to be `triaged` (you can't approve a plan
    for an already-remediated finding).
  - The plan to be in `AWAITING_APPROVAL` state.
- The console logs the approval to `saas_audit_events` with
  `action="remediation.approved"`, the operator's user id, the plan id,
  and a hash of the plan body.
- **The console never schedules execution itself.** It writes the
  approval; an operator with shell access still needs to execute the
  approved commands manually (or via their own change-management
  pipeline). This is intentional — the remediator's promise is "AI
  reasons, humans decide and act."

---

## 5b. HMAC Approval Token (Console ↔ Remediator integrity)

The Console and the Remediator are two independently-deployed
services. The Remediator already verifies inbound webhooks with an
`X-Blackglass-Signature` HMAC, but that protects only the *channel*,
not the *intent* — a leaked Remediator API key could let an attacker
fabricate "an operator approved plan X" without anybody clicking
anything in the Console.

To close that gap, the Console mints a short-lived HMAC-SHA256
**Approval Token** every time an operator clicks Approve / Reject:

```
token   = <payload_b64url>.<signature_b64url>
payload = JSON.stringify({
  rid: <recommendation_id>,   // bound to one plan
  tid: <tenant_id>,           // bound to one tenant
  dec: "approve" | "reject",  // bound to a specific decision
  act: <actor_user_id>,       // who clicked
  iat: <unix_seconds>,
  exp: <unix_seconds>         // default TTL = 5 minutes, max 1 hour
})
signature = HMAC-SHA256(payload_b64url, REMEDIATOR_APPROVAL_TOKEN_SECRET)
```

The token rides in the `X-Blackglass-Approval-Token` header on the
forwarded webhook. The Remediator validates it via
`app/core/security.py::verify_approval_token()` and rejects
(HTTP 401) on any of:

- bad signature, malformed payload, expired token
- recommendation_id mismatch (token signed for a *different* plan)
- tenant_id mismatch (token replayed across tenants)
- decision mismatch (a `reject` token presented as an `approve`)

**Enforcement is ON by default** as of 2026-05-08. Set
`REMEDIATOR_APPROVAL_TOKEN_SECRET` (>= 32 chars) on BOTH the
Console and the Remediator — they MUST share the same value — and
every approve/reject will require a valid token.

| `SECRET` set | `OPTIONAL` set | Behaviour                                                                                                                                  |
| ------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| yes          | (any)          | Enforcement ON. Tokens required.                                                                                                           |
| no           | yes            | Enforcement OFF — explicit legacy opt-out via `REMEDIATOR_APPROVAL_TOKEN_OPTIONAL=1`. Logs a warning at boot.                               |
| no           | no             | Default ON. The first approve attempt returns HTTP 500 with `approval_token_secret_not_configured` so the operator notices the mis-config. |

The default-on behaviour was a deliberate hardening — under the
previous opt-in default an operator could believe they had signed-
token enforcement when in fact the Console couldn't sign anything
and the Remediator was silently trusting the API key alone.

The format is deliberately NOT JWT — JWT's header/algorithm
negotiation is the source of half the JWT CVEs. A two-field
`payload.signature` with a fixed algorithm is simpler to audit.

| Threat                                                          | Mitigation                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Leaked Remediator API key                                       | Token is signed by Console secret; attacker also needs that secret.        |
| Replay across tenants (token from tenant A used for tenant B)  | Token binds `tid`; verifier checks against the recommendation's tenant.    |
| Replay across plans (token for plan X used for plan Y)          | Token binds `rid`; verifier checks against the URL's `recommendation_id`.  |
| Decision flip (reject token presented as approve)               | Token binds `dec`; verifier checks against the route's expected decision.  |
| Stale token used after revoked permission                       | TTL is 5 min by default. Set `ttlSeconds` lower for higher-risk tenants.   |

See `src/lib/server/remediator/approval-token.ts` (Console minter) and
`blackglass-remediator/app/core/security.py::verify_approval_token`
(Remediator verifier). `tests/unit/approval-token.test.ts` exercises
the full attack matrix.

---

## 6. Audit trail (worked example)

A real remediation flow generates this audit chain:

```
2026-05-07T10:00:00Z  scan.completed                  scanId=scan-abc  hostId=host-7
2026-05-07T10:00:01Z  drift.detected                  driftId=de-9     category=ssh title="PermitRootLogin yes"
2026-05-07T10:00:02Z  remediation.requested           driftId=de-9     remediationId=rem-3
2026-05-07T10:00:03Z  remediation.tier_classified     remediationId=rem-3 tier=approval_required
2026-05-07T10:00:05Z  remediation.plan_generated      remediationId=rem-3 commandCount=2 confidence=0.91
2026-05-07T10:00:06Z  remediation.sandbox_provisioned remediationId=rem-3 dropletId=12345
2026-05-07T10:00:42Z  remediation.sandbox_verified    remediationId=rem-3 result=pass durationMs=36000
2026-05-07T10:00:43Z  remediation.sandbox_destroyed   remediationId=rem-3 dropletId=12345
2026-05-07T10:00:43Z  remediation.awaiting_approval   remediationId=rem-3
2026-05-07T10:14:22Z  remediation.approved            remediationId=rem-3 actorUserId=usr-jamie planHash=sha256:f0ab…
2026-05-07T11:02:11Z  drift.lifecycle_changed         driftId=de-9     from=triaged to=remediated actorUserId=usr-jamie
```

Every row above is queryable from the Audit page in the BLACKGLASS
console. The `planHash` is what you'd compare against if a security
reviewer ever asks "did the operator approve the same plan that ran?"

---

## 7. Quality harness (regression-proofing the LLM)

`blackglass-remediator/tests/scenarios/` (work in progress) holds a
small library of canned drift events that exercise each risk tier and
each forbidden-command class. The harness runs these scenarios against
the configured LLM and asserts:

1. The risk tier matches the expected value (drift category & severity
   are deterministic inputs, so the tier should be deterministic too).
2. The plan does not contain any forbidden command pattern.
3. The plan's commands all match the allow-list for the tier (see
   `get_allowed_commands_for_policy`).
4. For sandboxable scenarios, verification passes against the synthetic
   drift state.

The harness is run before every prompt or model upgrade. A change that
makes the LLM more "creative" but breaks one of these scenarios is
treated as a regression, not a feature.

---

## 8. What the remediator deliberately does **not** do

Buyers ask about each of these. The answer is "no, by design":

- **No autonomous execution against production.** Even with future
  "auto-remediate" toggles, execution will require an explicit operator
  action.
- **No remote code execution from the LLM.** Tool-calling is restricted
  to a small allow-list (sandbox provisioning, audit emit, callback to
  BLACKGLASS); the LLM cannot invent new tool calls.
- **No background polling.** The remediator only acts on signed inbound
  webhooks from the BLACKGLASS console.
- **No outbound calls in air-gapped mode.** When `BLACKGLASS_AIRGAPPED=true`
  is set on the BLACKGLASS console, the console refuses to dispatch
  webhooks to the remediator (see `src/lib/server/airgap.ts` and
  `src/app/api/health/airgap/route.ts`). Air-gapped customers run their
  own remediator instance inside the network perimeter.
- **No fine-tuning on customer data.** The LLM is served read-only via
  Ollama; it has no training pipeline that absorbs customer drift events.

---

## 9. Where to look in the code

| Concern                              | File                                                                |
| ------------------------------------ | ------------------------------------------------------------------- |
| Risk-tier classification             | `app/agent/risk_policy.py::classify_policy_tier`                    |
| Auto-escalation on dangerous verbs   | `app/agent/risk_policy.py::escalate_tier_for_commands`              |
| Per-category confidence cap          | `app/agent/risk_policy.py::CATEGORY_CONFIDENCE_CAP`                 |
| Forbidden-command registry           | `app/agent/risk_policy.py::FORBIDDEN_COMMAND_PATTERNS`              |
| Strict-tiering fallback (env-flag)   | `app/agent/risk_policy.py::strict_tiering_enabled`                  |
| Plan generation                      | `app/agent/planner.py`                                              |
| Sandbox provisioning + teardown      | `app/sandbox/droplet.py`                                            |
| Sandbox verification orchestration   | `app/sandbox/verifier.py`                                           |
| Inbound webhook entry point          | `app/api/webhooks/blackglass.py`                                    |
| Approval token verifier (Remediator) | `app/core/security.py::verify_approval_token`                       |
| Approval token minter (Console)      | `src/lib/server/remediator/approval-token.ts`                       |
| Outbound callback to BLACKGLASS      | `app/clients/blackglass.py`                                         |
| Audit emit (BLACKGLASS side)         | `src/lib/server/audit-log.ts`                                       |
| Approval UI                          | `src/app/(app)/drift/_components/RemediationRecommendation.tsx`     |

---

## 10. Open future work (tracked, not shipped)

- **Per-tenant risk policies.** Today the tier model is global. Customers
  with stricter compliance regimes will want to push specific categories
  into `manual_only` for their tenant.
- **Immutable rollback artefacts.** Pre-fix snapshot of the affected
  configuration file, captured before approval is granted, so a failed
  apply can be deterministically reverted.
- **Approval quorum.** Two-of-N approver flow for `approval_required`
  plans on production-tagged hosts.

These are intentionally listed as future work — please don't claim them
on the marketing site until they ship.
