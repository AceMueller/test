# Deploying Drift to a VM

Drift keeps all state in one process's memory and holds long-lived
WebSocket connections, so it needs to run as a **single, persistent
process** — not a serverless/autoscaled setup. Any Ubuntu VM works.
This covers a bare-IP deployment (no domain, no TLS yet — see the note
at the bottom for adding HTTPS later).

## Option A: zero-SSH (recommended)

Paste the contents of [`cloud-init.sh`](./cloud-init.sh) into your cloud
provider's VM **user data** / **startup script** field when you *create*
the instance. The VM installs Node, clones the repo, and starts the app
as a systemd service automatically on first boot — no SSH required.

| Provider | Where to paste it |
|---|---|
| AWS EC2 | Launch instance → Advanced details → **User data** |
| GCP Compute Engine | Create instance → Management → Metadata → key `startup-script`, value = the script |
| DigitalOcean | Create Droplet → Advanced options → **User data** |

For all three: pick an Ubuntu 22.04 or 24.04 image, and open **inbound TCP
port 3000** in the security group / firewall rules / droplet firewall
(alongside port 22 for SSH if you might want it later).

Once it's up, visit `http://<the-instance's-public-ip>:3000`.

SSH in later only if you want to check on it:
```
sudo systemctl status drift
sudo journalctl -u drift -f          # logs
sudo nano /opt/drift/.env            # e.g. add ANTHROPIC_API_KEY
sudo systemctl restart drift         # after editing .env
```

## Option B: manual, over SSH

If you'd rather set it up yourself on a VM you already have:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone -b main https://github.com/AceMueller/test.git drift
cd drift
bash deploy/setup.sh
```

Open inbound TCP port 3000 in your cloud firewall, then visit
`http://<server-ip>:3000`.

## Redeploying after new commits land on `main`

```bash
cd drift   # or /opt/drift if you used cloud-init
bash deploy/deploy.sh
```

## Constraints worth knowing

- **Single instance only.** State is in-memory; running more than one
  replica behind a load balancer would split rooms/messages across
  processes inconsistently. Don't enable autoscaling for this service.
- **No TLS yet.** This setup serves plain `http://`/`ws://` on the raw
  IP — fine for testing, but unencrypted and browsers won't show it as
  secure. When you have a domain, the standard low-effort upgrade is
  adding [Caddy](https://caddyserver.com/) as a reverse proxy in front
  (`caddy reverse-proxy --from your-domain.com --to localhost:3000`
  gets you free, automatic HTTPS via Let's Encrypt); ask if you want
  that wired into the systemd setup here.
- **Restarts wipe state.** `systemctl restart drift` (or a VM reboot)
  clears all rooms/messages — this app has no database, by design (see
  the main README).
