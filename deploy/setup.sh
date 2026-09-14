#!/usr/bin/env bash
# Manual setup path: run this yourself over SSH from inside a clone of the
# repo, e.g.:
#   git clone -b main https://github.com/AceMueller/test.git drift
#   cd drift && bash deploy/setup.sh
#
# (If you don't need to SSH in at all, use deploy/cloud-init.sh instead as
# your cloud provider's VM "user data" / "startup script" -- the VM then
# configures itself on first boot with no manual steps.)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]; then
  echo "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

npm ci

[ -f .env ] || cp .env.example .env

NPM_BIN="$(command -v npm)"
sed \
  -e "s#__USER__#$(whoami)#g" \
  -e "s#__WORKDIR__#$APP_DIR#g" \
  -e "s#__NPM_BIN__#$NPM_BIN#g" \
  "$APP_DIR/deploy/drift.service" | sudo tee /etc/systemd/system/drift.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now drift

echo
echo "Drift is running as a systemd service."
echo "  Status:  sudo systemctl status drift"
echo "  Logs:    sudo journalctl -u drift -f"
echo "  Config:  edit $APP_DIR/.env, then: sudo systemctl restart drift"
echo
echo "Open inbound TCP port 3000 (or your PORT) in your cloud firewall/security group, then visit:"
echo "  http://<this-server-public-ip>:3000"
