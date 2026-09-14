#!/usr/bin/env bash
# Redeploy: pulls the latest commits on the current branch and restarts
# the service. Run over SSH from inside the cloned repo:
#   bash deploy/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

git pull --ff-only
npm ci
sudo systemctl restart drift

echo "Redeployed. Logs: sudo journalctl -u drift -f"
