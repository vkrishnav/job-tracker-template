#!/bin/bash
# Installs a user LaunchAgent that keeps the API server (and its in-process fetch/scan
# scheduler) running in the background, restarting on crash and at login.
# Remove with:  launchctl bootout gui/$(id -u)/com.vamsi.job-tracker-api
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
DEST="$HOME/Library/LaunchAgents/com.vamsi.job-tracker-api.plist"
mkdir -p "$REPO/logs" "$HOME/Library/LaunchAgents"
sed -e "s#__NODE__#$NODE#g" -e "s#__REPO__#$REPO#g" "$REPO/scripts/com.vamsi.job-tracker-api.plist" > "$DEST"
launchctl bootout "gui/$(id -u)/com.vamsi.job-tracker-api" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "Installed $DEST"
echo "Logs: $REPO/logs/api.log — check: curl -s localhost:3001/api/health"
