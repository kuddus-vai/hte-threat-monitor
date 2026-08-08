#!/usr/bin/env bash
# HTE Threat Monitor — systemd install helper (user service, no sudo needed)
# Usage: ./install-service.sh [--frontend]
set -euo pipefail

UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

cp "$(dirname "$0")/hte-threat-monitor.service" "$UNIT_DIR/"

systemctl --user daemon-reload
systemctl --user enable --now hte-threat-monitor.service

echo "✅ Backend service enabled. Status:"
systemctl --user status hte-threat-monitor.service --no-pager | head -8
echo
echo "💡 Frontend (vite) 24/7 is optional — for local dev run: npx vite --config frontend/vite.config.ts frontend"
