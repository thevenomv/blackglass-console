# RustDesk: run these on your machines

Your **RustDesk server** (`206.189.114.207` + public key) is unchanged. These steps only align **clients** (Windows home PC + Linux demo droplet).

## 1) Windows (home PC) — after RustDesk is installed

1. **Right‑click PowerShell → Run as administrator**.
2. From this repo:

```powershell
Set-Location "C:\Users\sible\OneDrive\Desktop\Blackglass"
.\scripts\rustdesk-windows-apply-config.ps1
```

Or by hand:

```powershell
& "$env:ProgramFiles\RustDesk\rustdesk.exe" --config "host=206.189.114.207,key=8FFJuTNp6R4mA3QgCGh2JB4wEoZ9uSnaBWcj85vipQ4="
```

Then open RustDesk and confirm your **RustDesk ID** appears.

## 2) Linux demo droplet (`167.99.59.55`)

**Option A — copy script and run (recommended)**

From PowerShell on Windows (adjust SSH user if not `root`):

```powershell
cd "C:\Users\sible\OneDrive\Desktop\Blackglass"
scp scripts/rustdesk-linux-demo-setup.sh root@167.99.59.55:/tmp/
ssh root@167.99.59.55 "chmod +x /tmp/rustdesk-linux-demo-setup.sh && /tmp/rustdesk-linux-demo-setup.sh"
```

Optional permanent password for demos (pick a strong one):

```powershell
ssh root@167.99.59.55 "RD_PERM_PASSWORD='your-demo-password' bash /tmp/rustdesk-linux-demo-setup.sh"
```

**Option B — one-liner on the server** (after `curl`/`gpg` trust as you prefer)

Upload `scripts/rustdesk-linux-demo-setup.sh` content however you like and run `sudo bash rustdesk-linux-demo-setup.sh`.

## 3) Firewall

- **RustDesk server** droplet: keep TCP `21115–21119`, UDP `21116` (your existing rules).
- **Linux demo**: default outbound is usually enough; if you locked egress, allow outbound to `206.189.114.207` on those ports.

## 4) Connect

On Windows RustDesk, enter the **Linux machine’s RustDesk ID** and password (one-time or permanent you set).

---

**Security:** Do not paste DigitalOcean API tokens into chats or commit them to git. Rotate any token that was exposed.
