#!/bin/bash
# Self-configuring VM bootstrap for Drift.
#
# Paste this whole file into your cloud provider's "user data" /
# "startup script" field when you CREATE the instance:
#   - AWS EC2: "User data" (Advanced details)
#   - GCP Compute Engine: "startup-script" metadata key
#   - DigitalOcean: "User data" (Advanced options)
#
# Runs once as root on first boot. Installs Node, clones the repo,
# and starts the app as a systemd service -- no SSH or manual setup
# required. SSH in afterward only if you want to check logs, edit
# .env (e.g. to add ANTHROPIC_API_KEY), or redeploy.
set -euxo pipefail

REPO_URL="https://github.com/AceMueller/test.git"
BRANCH="main"
APP_DIR="/opt/drift"
APP_USER="drift"

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"

git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"
cp .env.example .env
# Edit /opt/drift/.env (e.g. to set ANTHROPIC_API_KEY), then:
#   systemctl restart drift

npm ci
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

NPM_BIN="$(command -v npm)"
sed \
  -e "s#__USER__#$APP_USER#g" \
  -e "s#__WORKDIR__#$APP_DIR#g" \
  -e "s#__NPM_BIN__#$NPM_BIN#g" \
  "$APP_DIR/deploy/drift.service" > /etc/systemd/system/drift.service

systemctl daemon-reload
systemctl enable --now drift
