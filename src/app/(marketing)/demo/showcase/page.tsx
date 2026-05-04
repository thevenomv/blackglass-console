import { DemoCopyBlock } from "@/components/demo/DemoCopyBlock";
import { DEMO_TENANT_NAME } from "@/lib/demo/seed";

/** Raw script base — change if you fork the repo. */
const SCRIPTS_RAW =
  "https://raw.githubusercontent.com/thevenomv/blackglass-console/main/scripts";

const BASH_VISIBLE_CHANGE = `# On the Linux desktop (RustDesk session) — visible to the audience
sudo apt-get update -qq && sudo apt-get install -y -qq nmap
nmap --version | head -1`;

const BASH_SILENT_SSH = `# From your laptop (SSH), not inside RustDesk — desktop appears unchanged
# Replace DEMO_VM_IP with your demo droplet public IP.
ssh -o StrictHostKeyChecking=accept-new root@DEMO_VM_IP \\
  "sudo useradd -r -M -s /usr/sbin/nologin blackglass-silent-demo 2>/dev/null || true"`;

const PS_COLLECTOR = `# PowerShell — register the demo host with your BLACKGLASS collector (example)
Set-Location "C:\\path\\to\\Blackglass"
$env:DO_TOKEN = "YOUR_DIGITALOCEAN_TOKEN"
.\\scripts\\configure-collector-on-app.ps1 \`
  -Token  $env:DO_TOKEN \`
  -AppId  YOUR_DO_APP_ID \`
  -HostIp DEMO_VM_IP \`
  -HostName "rustdesk-demo"`;

const CURL_LINUX_CLIENT = `# Install RustDesk client on the demo VM and point at your ID server
curl -fsSL ${SCRIPTS_RAW}/rustdesk-linux-demo-setup.sh | \\
  sudo RD_ID_SERVER='YOUR_ID_SERVER_IP' RD_PUBLIC_KEY='YOUR_HBBS_PUBLIC_KEY' bash`;

const CURL_ID_SERVER = `# On the RustDesk ID server (Droplet console) — UFW 21114 + hbbs -r if systemd
curl -fsSL ${SCRIPTS_RAW}/rustdesk-do-console-setup.sh | \\
  sudo KEY='ssh-ed25519 AAAA... your-comment' RELAY_IP='YOUR_PUBLIC_RELAY_IP' bash`;

export default function DemoShowcasePage() {
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-accent-blue">
          BLACKGLASS · live demo playbook
        </p>
        <h1 className="text-2xl font-semibold text-fg-primary">Show your drift story in one take</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Pair a <strong className="font-medium text-fg-primary">RustDesk</strong> window (Linux desktop) with
          this <strong className="font-medium text-fg-primary">sample workspace</strong> ({DEMO_TENANT_NAME}). Run
          the steps below so desktop-visible changes and silent SSH changes both land in{" "}
          <strong className="font-medium text-fg-primary">BLACKGLASS</strong> scans — then narrate the delta from
          the Overview and Findings tabs.
        </p>
        <p className="text-xs text-fg-faint">
          Firewall tip for RustDesk 1.4+: allow TCP <strong className="text-fg-muted">21114</strong> on the ID
          server (and cloud firewall), not only 21115–21119, so clients don’t hang during rendezvous.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-fg-primary">1 · Wire the demo host</h2>
        <p className="text-sm text-fg-muted">
          Capture a baseline after the collector sees the VM. Replace placeholders with your app id and IPs.
        </p>
        <DemoCopyBlock label="PowerShell — configure collector (example)" code={PS_COLLECTOR} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-fg-primary">2 · RustDesk scripts (optional)</h2>
        <p className="text-sm text-fg-muted">
          Use these when the ID server and demo VM are separate. Ensure TCP <strong>21114</strong> is allowed on
          the ID host and cloud firewall.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <DemoCopyBlock label="ID server — console bootstrap" code={CURL_ID_SERVER} />
          <DemoCopyBlock label="Demo VM — RustDesk client install" code={CURL_LINUX_CLIENT} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-fg-primary">3 · Narrated drift beats</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-muted">
          <li>
            In this demo app, use <strong className="text-fg-primary">Capture baseline</strong> after the host
            is healthy.
          </li>
          <li>
            Run the <strong className="text-fg-primary">visible change</strong> in RustDesk — the audience sees
            the terminal.
          </li>
          <li>
            Click <strong className="text-fg-primary">Run scan</strong> and open <strong>Findings</strong> — call
            out new packages / tooling.
          </li>
          <li>
            Run the <strong className="text-fg-primary">silent SSH</strong> snippet from your laptop.
          </li>
          <li>
            <strong className="text-fg-primary">Run scan</strong> again — contrast what the UI caught vs what was
            visible on screen.
          </li>
        </ol>
        <DemoCopyBlock label="Bash — visible change (inside RustDesk)" code={BASH_VISIBLE_CHANGE} />
        <DemoCopyBlock label="Bash — silent change (SSH from your laptop)" code={BASH_SILENT_SSH} />
      </section>

      <section className="rounded-card border border-border-subtle bg-bg-elevated/40 px-4 py-3 text-xs text-fg-muted">
        <p>
          This page is static copy helpers only — the sample workspace still uses fictional data in other tabs.
          For a recording-safe demo user, scrub tokens and use disposable VMs.
        </p>
      </section>
    </div>
  );
}
