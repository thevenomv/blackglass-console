# Security policy

## Supported versions

Security updates are applied to the **default branch** of this repository and released through your normal deploy pipeline (hosted SaaS or self-hosted Helm chart). There is no separate long-term support stream; upgrade by tracking `main` or your vendor’s release channel.

## Reporting a vulnerability

**Please do not** open a public GitHub issue with exploit details, payloads, or live customer data.

1. **Preferred:** Open a [GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) (private submission) if the repository has advisories enabled for your role.
2. **Alternative:** Email **`security@blackglasssec.com`** (or the address published on your deployment’s `/security` page if it differs). Include a short description, affected component (web app, worker, remediator, Helm chart), and reproduction steps or a proof-of-concept where safe.

We aim to acknowledge receipt within **a few business days** and coordinate disclosure and fix timing with you. If you need a formal SLA, route through your commercial support channel.

## Scope (typical)

In scope: authentication and session handling, tenant isolation (RLS), API authorization, secret handling, outbound webhooks, worker job handling, supply-chain scripts that run in CI with secrets, and the Helm chart’s default network and security context settings.

Out of scope: social engineering, spam/abuse of public marketing forms, issues in third-party services without a clear Blackglass defect, and findings that require physical access to unlocked operator machines.

## Safe harbor

If you make a good-faith effort to avoid privacy violations, degradation of production services, or data destruction, we will not pursue civil or criminal action against you for research conducted under this policy.

## More detail

Operator-facing control mapping and architecture notes live in [docs/security-compliance.md](docs/security-compliance.md) (repository access only; not linked from public marketing footers per [docs/README.md](docs/README.md)).
