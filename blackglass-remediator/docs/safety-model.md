# Remediator safety model

> Version: 1.0 · Last reviewed: 2026-05-07
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
| Risk-tier classification             | `app/agent/risk_policy.py`                                          |
| Forbidden-command registry           | `app/agent/risk_policy.py::FORBIDDEN_COMMAND_PATTERNS`              |
| Plan generation                      | `app/agent/planner.py`                                              |
| Sandbox provisioning + teardown      | `app/sandbox/droplet.py`                                            |
| Sandbox verification orchestration   | `app/sandbox/verifier.py`                                           |
| Inbound webhook entry point          | `app/api/webhooks/blackglass.py`                                    |
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
