/**
 * Deterministic demo workspace data — never touches real tenants or collectors.
 * Used only under /demo/* routes.
 */

export const DEMO_TENANT_NAME = "Northbridge Systems";
export const DEMO_TENANT_SLUG = "northbridge-demo";

export type DemoHost = {
  id: string;
  name: string;
  env: "production" | "staging";
  region: string;
  os: string;
  kernel: string;
  lastScan: string;
  riskScore: number;
  sshHardening: "pass" | "warn" | "fail";
};

export const DEMO_HOSTS: DemoHost[] = [
  {
    id: "demo-h-01",
    name: "edge-api-01",
    env: "production",
    region: "lon1",
    os: "Ubuntu 22.04",
    kernel: "5.15.0-112-generic",
    lastScan: "2026-05-02T14:22:00Z",
    riskScore: 2,
    sshHardening: "pass",
  },
  {
    id: "demo-h-02",
    name: "batch-worker-03",
    env: "production",
    region: "lon1",
    os: "Debian 12",
    kernel: "6.1.0-18-amd64",
    lastScan: "2026-05-02T14:21:00Z",
    riskScore: 6,
    sshHardening: "warn",
  },
  {
    id: "demo-h-03",
    name: "jump-sbx-01",
    env: "staging",
    region: "fra1",
    os: "Rocky 9",
    kernel: "5.14.0-362.el9",
    lastScan: "2026-05-02T13:58:00Z",
    riskScore: 14,
    sshHardening: "fail",
  },
  {
    id: "demo-h-04",
    name: "postgres-rr-02",
    env: "production",
    region: "lon1",
    os: "Ubuntu 22.04",
    kernel: "5.15.0-112-generic",
    lastScan: "2026-05-02T14:20:00Z",
    riskScore: 3,
    sshHardening: "pass",
  },
  {
    id: "demo-h-05",
    name: "redis-cache-01",
    env: "production",
    region: "lon1",
    os: "Ubuntu 22.04",
    kernel: "5.15.0-112-generic",
    lastScan: "2026-05-02T14:19:00Z",
    riskScore: 1,
    sshHardening: "pass",
  },
  {
    id: "demo-h-06",
    name: "ci-runner-07",
    env: "staging",
    region: "fra1",
    os: "Ubuntu 24.04",
    kernel: "6.8.0-45-generic",
    lastScan: "2026-05-02T12:40:00Z",
    riskScore: 8,
    sshHardening: "warn",
  },
  {
    id: "demo-h-07",
    name: "obs-metrics-01",
    env: "production",
    region: "lon1",
    os: "Debian 12",
    kernel: "6.1.0-18-amd64",
    lastScan: "2026-05-02T14:18:00Z",
    riskScore: 4,
    sshHardening: "pass",
  },
  {
    id: "demo-h-08",
    name: "legacy-monolith-01",
    env: "production",
    region: "lon1",
    os: "Ubuntu 20.04",
    kernel: "5.4.0-190-generic",
    lastScan: "2026-05-02T11:05:00Z",
    riskScore: 19,
    sshHardening: "fail",
  },
  {
    id: "demo-h-09",
    name: "vpn-gateway-01",
    env: "production",
    region: "lon1",
    os: "AlmaLinux 9",
    kernel: "5.14.0-362.el9",
    lastScan: "2026-05-02T14:17:00Z",
    riskScore: 5,
    sshHardening: "warn",
  },
  {
    id: "demo-h-10",
    name: "qa-cluster-ctrl",
    env: "staging",
    region: "fra1",
    os: "Ubuntu 22.04",
    kernel: "5.15.0-112-generic",
    lastScan: "2026-05-02T09:30:00Z",
    riskScore: 7,
    sshHardening: "warn",
  },
];

export type DemoDriftFinding = {
  id: string;
  hostId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  detectedAt: string;
  lifecycle: "new" | "acknowledged" | "resolved";
};

export const DEMO_DRIFT: DemoDriftFinding[] = [
  {
    id: "demo-d-01",
    hostId: "demo-h-03",
    title: "sshd PermitRootLogin=yes (expected: prohibit-password)",
    severity: "high",
    category: "ssh",
    detectedAt: "2026-05-02T11:12:00Z",
    lifecycle: "new",
  },
  {
    id: "demo-d-02",
    hostId: "demo-h-08",
    title: "/etc/ssh/sshd_config: MACs line removed CIS-benchmark MACs",
    severity: "medium",
    category: "ssh",
    detectedAt: "2026-05-02T10:44:00Z",
    lifecycle: "acknowledged",
  },
  {
    id: "demo-d-03",
    hostId: "demo-h-02",
    title: "New listening TCP 0.0.0.0:9200 (process: java)",
    severity: "high",
    category: "network",
    detectedAt: "2026-05-02T10:02:00Z",
    lifecycle: "new",
  },
  {
    id: "demo-d-04",
    hostId: "demo-h-06",
    title: "User prometheus added to sudo group vs baseline",
    severity: "medium",
    category: "identity",
    detectedAt: "2026-05-02T09:51:00Z",
    lifecycle: "new",
  },
  {
    id: "demo-d-05",
    hostId: "demo-h-01",
    title: "Kernel sysctl net.ipv4.ip_forward toggled to 1",
    severity: "low",
    category: "kernel",
    detectedAt: "2026-05-01T22:18:00Z",
    lifecycle: "resolved",
  },
];

export type DemoSshCheck = {
  hostId: string;
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export const DEMO_SSH_CHECKS: DemoSshCheck[] = [
  {
    hostId: "demo-h-03",
    check: "PermitRootLogin",
    status: "fail",
    detail: "set to 'yes' — baseline requires 'prohibit-password'",
  },
  {
    hostId: "demo-h-09",
    check: "PasswordAuthentication",
    status: "warn",
    detail: "enabled while MFA boundary expects key-only",
  },
  {
    hostId: "demo-h-01",
    check: "MaxAuthTries / LoginGraceTime",
    status: "pass",
    detail: "within CIS L1 profile",
  },
  {
    hostId: "demo-h-08",
    check: "HostKeyAlgorithms",
    status: "fail",
    detail: "weak host key algorithm still advertised",
  },
];

export type DemoRemediation = {
  id: string;
  title: string;
  owner: string;
  due: string;
  status: "open" | "in_progress" | "verified";
};

export const DEMO_REMEDIATIONS: DemoRemediation[] = [
  {
    id: "r-01",
    title: "Harden jump host sshd_config and reload sshd",
    owner: "platform@northbridge.example",
    due: "2026-05-05",
    status: "in_progress",
  },
  {
    id: "r-02",
    title: "Restrict batch-worker Prometheus exporter to loopback + firewall",
    owner: "sre@northbridge.example",
    due: "2026-05-08",
    status: "open",
  },
  {
    id: "r-03",
    title: "Rotate legacy-monolith SSH host keys",
    owner: "security@northbridge.example",
    due: "2026-05-12",
    status: "open",
  },
];

export type DemoAuditRow = {
  at: string;
  actor: string;
  action: string;
  detail: string;
};

export const DEMO_AUDIT: DemoAuditRow[] = [
  {
    at: "2026-05-02T14:22:01Z",
    actor: "sam@northbridge.example",
    action: "scan.completed",
    detail: "Fleet scan 412 hosts (sample) · 6 new findings",
  },
  {
    at: "2026-05-02T11:15:22Z",
    actor: "jamie@northbridge.example",
    action: "drift.acknowledged",
    detail: "demo-d-01 on jump-sbx-01",
  },
  {
    at: "2026-05-02T09:02:00Z",
    actor: "system",
    action: "policy.evaluate",
    detail: "CIS SSH L1 — 2 failures, 4 warns",
  },
];

export type DemoMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  paidSeat: boolean;
  mfa: boolean;
};

export const DEMO_MEMBERS: DemoMember[] = [
  {
    id: "u-1",
    name: "Sam Okonkwo",
    email: "sam@northbridge.example",
    role: "owner",
    paidSeat: true,
    mfa: true,
  },
  {
    id: "u-2",
    name: "Jamie Chen",
    email: "jamie@northbridge.example",
    role: "operator",
    paidSeat: true,
    mfa: true,
  },
  {
    id: "u-3",
    name: "Alex Rivera",
    email: "alex@northbridge.example",
    role: "viewer",
    paidSeat: false,
    mfa: true,
  },
  {
    id: "u-4",
    name: "Priya Nair",
    email: "priya@northbridge.example",
    role: "guest_auditor",
    paidSeat: false,
    mfa: false,
  },
];
