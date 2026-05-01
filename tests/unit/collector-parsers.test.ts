import { describe, expect, it } from "vitest";
import {
  parseFirewall,
  parseListeners,
  parseServices,
  parseSshConfig,
  parseSudoers,
  parseUsers,
} from "@/lib/server/collector";

describe("collector output parsers", () => {
  it("parseListeners extracts public TCP listeners from ss sample", () => {
    const raw = `State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
LISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=1,fd=3))
LISTEN 0      128        127.0.0.1:631       0.0.0.0:*    users:(("cupsd",pid=2,fd=4))
LISTEN 0      128             [::]:443          [::]:*    users:(("nginx",pid=3,fd=5))
`;
    const ports = parseListeners(raw);
    expect(ports.map((p) => p.port)).toContain(22);
    expect(ports.map((p) => p.port)).not.toContain(631);
    expect(ports.some((p) => p.port === 443)).toBe(true);
  });

  it("parseUsers reads passwd-style lines", () => {
    const raw = "alice:1000\nbob:1001\n";
    expect(parseUsers(raw)).toEqual([
      { username: "alice", uid: 1000 },
      { username: "bob", uid: 1001 },
    ]);
  });

  it("parseSudoers splits group members", () => {
    const raw = "sudo:x:27:alice,bob\n";
    expect(parseSudoers(raw)).toEqual(["alice", "bob"]);
  });

  it("parseSshConfig reads sshd -T output", () => {
    const raw = `permitrootlogin no\npasswordauthentication no\n`;
    expect(parseSshConfig(raw)).toEqual({
      permitRootLogin: "no",
      passwordAuthentication: "no",
    });
  });

  it("parseFirewall detects active ufw and default", () => {
    const raw = `Status: active\nDefault: deny (incoming)\n-----------\n22/tcp ALLOW`;
    const fw = parseFirewall(raw);
    expect(fw.active).toBe(true);
    expect(fw.defaultInbound).toBe("deny");
    expect(fw.rules.some((r) => r.includes("22/tcp"))).toBe(true);
  });

  it("parseServices keeps running units", () => {
    const raw = `
  ssh.service    loaded active running OpenBSD Secure Shell server
`;
    const svcs = parseServices(raw);
    expect(svcs.some((s) => s.unit === "ssh.service")).toBe(true);
  });
});
