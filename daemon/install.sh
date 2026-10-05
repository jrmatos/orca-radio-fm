#!/usr/bin/env sh
# Installs the Radio FM button daemon as a systemd user service (starts at login).
# Uninstall: systemctl --user disable --now orca-radio-fm && rm ~/.config/systemd/user/orca-radio-fm.service
set -eu
command -v node >/dev/null || { echo "node is required (https://nodejs.org)"; exit 1; }
command -v dbus-monitor >/dev/null || { echo "dbus-monitor is required (package: dbus / dbus-bin)"; exit 1; }
command -v systemctl >/dev/null || { echo "systemd is required"; exit 1; }
DIR=$(cd "$(dirname "$0")" && pwd)
NODE=$(command -v node)
UNIT="$HOME/.config/systemd/user/orca-radio-fm.service"
mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNIT
[Unit]
Description=Orca Radio FM panel button daemon
After=graphical-session.target

[Service]
ExecStart=$NODE $DIR/radio-daemon.mjs
Restart=on-failure
RestartSec=3
KillMode=process

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now orca-radio-fm
systemctl --user restart orca-radio-fm
echo "installed: $UNIT"
