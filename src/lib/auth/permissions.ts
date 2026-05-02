export type Role = "viewer" | "auditor" | "operator" | "admin";

const allow = {
  runScan: ["operator", "admin"] as Role[],
  acceptBaseline: ["operator", "admin"] as Role[],
  driftMutation: ["operator", "admin"] as Role[],
  rotateKeys: ["admin"] as Role[],
  exportEvidence: ["auditor", "operator", "admin"] as Role[],
};

export function can(role: Role, action: keyof typeof allow): boolean {
  return allow[action].includes(role);
}
