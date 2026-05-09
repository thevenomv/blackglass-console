/**
 * /demo/sandbox — static walkthrough of what a Blackglass scan looks like.
 *
 * Replaced the previous "live ephemeral Droplet" widget on 2026-05-07 — see
 * docs/runbooks/operations.md §5 for the rationale.  The widget was costing
 * a permanent Droplet quota slot + ongoing ops complexity (cloud-init, ssh
 * handshake debugging, BullMQ plumbing, DO App-Platform → Droplet network
 * paths we couldn't fix) for marginal commercial value, and the same slot
 * is now used for the long-lived sales-demo VM that actually closes deals.
 *
 * This page is now a server component with zero infrastructure dependencies:
 * the eight drift scenarios are described inline; visitors who want to see
 * the loop end-to-end book a live demo via the prominent CTA.
 */

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What a Blackglass scan looks like",
  description:
    "Eight real drift scenarios on a Linux host, with the exact severity, rationale, and remediation Blackglass surfaces. Book a live walkthrough.",
};

type Severity = "critical" | "high" | "medium";

type Scene = {
  phase: number;
  title: string;
  category: string;
  severity: Severity;
  rationale: string;
  suggestedActions: string[];
};

// Same eight scenes the old widget cycled through — kept here as a single
// source of truth for both the marketing page and the API's SCENE_LABELS.
const SCENES: Scene[] = [
  {
    phase: 1,
    title: "Backdoor port listener on TCP 4444",
    category: "LISTENERS",
    severity: "high",
    rationale:
      "An unexpected process is listening on TCP 4444. This port is commonly used by reverse shells and C2 frameworks such as Metasploit. It was not present in the host's baseline.",
    suggestedActions: [
      "Identify which service is listening on the suspicious port using your normal host-inspection workflow.",
      "Stop the listener and remove the associated programme or installer after change approval.",
      "Look for scheduled jobs or services that would bring the listener back after reboot.",
    ],
  },
  {
    phase: 2,
    title: "NOPASSWD sudoers entry added",
    category: "SUDOERS",
    severity: "critical",
    rationale:
      "A sudoers rule now allows password-less privilege escalation. This was not present in the baseline. Any process running as this user can silently gain root.",
    suggestedActions: [
      "Edit sudo policy through your approved admin path and remove passwordless root escalation for untrusted accounts.",
      "Review supplemental sudo policy files for anything that was not in the approved baseline.",
      "Correlate privileged activity in your logging stack to see who used the new rule.",
    ],
  },
  {
    phase: 3,
    title: "Rogue user account 'attacker-ssh' created",
    category: "USERS",
    severity: "high",
    rationale:
      "User account 'attacker-ssh' (UID 1002) was not present in the baseline. Unauthorised accounts are a primary persistence mechanism — they survive reboots and password rotations.",
    suggestedActions: [
      "Confirm whether the new account is authorised; if not, treat it as incident response.",
      "Review SSH keys, scheduled jobs, and running sessions tied to that account.",
      "Remove the account and its home directory through your standard identity procedure.",
    ],
  },
  {
    phase: 4,
    title: "Rogue user added to sudo group",
    category: "SUDO_GROUP",
    severity: "critical",
    rationale:
      "The 'attacker-ssh' account was added to the `sudo` group, granting full privileged-command access. Combined with the NOPASSWD entry above, this is a clear path to silent root.",
    suggestedActions: [
      "List members of the administrators group and remove anyone who should not have full sudo access.",
      "Compare group membership to the frozen baseline snapshot.",
      "Rotate credentials for any account that may have been misused.",
    ],
  },
  {
    phase: 5,
    title: "sshd PermitRootLogin set to yes",
    category: "SSH_CONFIG",
    severity: "critical",
    rationale:
      "The sshd_config now permits direct root login. This deviates from the baseline (which had it disabled) and dramatically expands the attack surface — every brute-force attempt now targets root directly.",
    suggestedActions: [
      "Restore the SSH server policy so interactive root login is not allowed.",
      "Reload the SSH service using your change window and validation checklist.",
      "Review authentication logs for successful root sessions after the drift appeared.",
    ],
  },
  {
    phase: 6,
    title: "Cron-based C2 beacon installed",
    category: "CRON",
    severity: "critical",
    rationale:
      "A new cron entry pipes `curl` output to `bash` every 5 minutes from an external IP. This is a textbook command-and-control beacon — it executes whatever the attacker serves, with root privileges.",
    suggestedActions: [
      "Delete the unauthorised scheduled job that downloads and executes remote content.",
      "Inspect outbound connections initiated by scheduled tasks.",
      "Block the remote destination at your firewall or egress filter until the incident is closed.",
    ],
  },
  {
    phase: 7,
    title: "SUID binary planted in /usr/local/bin",
    category: "FILE_INTEGRITY",
    severity: "high",
    rationale:
      "A new SUID-root binary was planted outside any package's manifest. SUID binaries execute with the file owner's privileges regardless of who runs them — this is a stealthy privilege-escalation backdoor.",
    suggestedActions: [
      "Find newly added set-user-ID binaries outside your software catalogue.",
      "Verify whether the file belongs to an installed package; if not, escalate as malware.",
      "Remove the binary and review who executed it in your command logging.",
    ],
  },
  {
    phase: 8,
    title: "/etc/passwd set to world-writable",
    category: "FILE_INTEGRITY",
    severity: "critical",
    rationale:
      "`/etc/passwd` permissions changed from 0644 to 0666. Any local user can now add a new UID-0 account by appending a single line — this is one of the simplest local-to-root paths in Linux.",
    suggestedActions: [
      "Restore strict file permissions on the system account database.",
      "Inspect the file for hidden administrator accounts or duplicate user IDs.",
      "Review authentication and shell history logs around the time permissions changed.",
    ],
  },
];

const SEV_STYLE: Record<Severity, { dot: string; pill: string }> = {
  critical: { dot: "bg-red-500", pill: "text-red-400 bg-red-500/10 border-red-500/30" },
  high: { dot: "bg-orange-500", pill: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
  medium: { dot: "bg-amber-500", pill: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
};

const BOOK_DEMO_HREF =
  process.env.NEXT_PUBLIC_BOOK_DEMO_URL?.trim() || "mailto:hello@blackglasssec.com?subject=Blackglass%20live%20demo";

export default function SandboxWalkthroughPage() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <header className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Walkthrough</p>
        <h1 className="text-2xl font-semibold text-fg-primary sm:text-3xl">
          What a Blackglass scan looks like
        </h1>
        <p className="max-w-2xl text-sm text-fg-muted sm:text-base">
          A real Linux host can drift in dozens of ways an attacker would exploit. Below are eight
          scenarios Blackglass detects on the next scan — each with the exact severity, rationale,
          and remediation our customers see in the console. To watch the full loop
          (baseline → drift → detect → propose → human approval → verify) on your own systems,
          book a live demo.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={BOOK_DEMO_HREF}
            className="inline-flex items-center gap-1.5 rounded-card bg-accent-blue px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue-hover"
          >
            Book a live demo →
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-1.5 rounded-card border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary transition-colors hover:bg-bg-elevated"
          >
            Start free trial
          </Link>
        </div>
      </header>

      {/* Phase grid */}
      <section className="grid gap-3 sm:grid-cols-2">
        {SCENES.map((scene) => {
          const sev = SEV_STYLE[scene.severity];
          return (
            <article
              key={scene.phase}
              className="flex flex-col gap-3 rounded-card border border-border-default bg-bg-panel p-5 transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${sev.dot}`} />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-fg-faint">
                    Scenario {scene.phase} · {scene.category}
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${sev.pill}`}
                >
                  {scene.severity}
                </span>
              </div>
              <h2 className="text-base font-semibold text-fg-primary">{scene.title}</h2>
              <p className="text-xs leading-relaxed text-fg-muted">{scene.rationale}</p>
              <details className="group">
                <summary className="cursor-pointer text-[11px] font-medium text-fg-faint transition-colors hover:text-fg-muted">
                  Suggested remediation ({scene.suggestedActions.length}) ▾
                </summary>
                <ul className="mt-2 space-y-1.5 border-t border-border-subtle pt-2">
                  {scene.suggestedActions.map((a, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-fg-muted">
                      <span className="mt-0.5 shrink-0 text-fg-faint">→</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          );
        })}
      </section>

      {/* Closing CTA */}
      <section className="flex flex-col gap-4 rounded-card border border-accent-blue/30 bg-accent-blue/5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-fg-primary">See it run on your own host</h2>
          <p className="text-xs text-fg-muted">
            A 20-minute live walkthrough on a real Linux VM. We capture a baseline, introduce
            controlled changes, and watch Blackglass classify each one with severity and context.
            Suggested fixes can be validated in an isolated environment first, then approved for
            production — automation never runs blindly against your live systems.
          </p>
        </div>
        <Link
          href={BOOK_DEMO_HREF}
          className="shrink-0 rounded-card bg-accent-blue px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue-hover"
        >
          Book a live demo →
        </Link>
      </section>
    </div>
  );
}
