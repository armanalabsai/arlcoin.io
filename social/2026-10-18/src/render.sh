#!/usr/bin/env bash
# Renders the 2026-10-18 cards with the local Chromium. Run from the repository root:
#   bash social/2026-10-18/src/render.sh
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)"
chrome="${CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}"
shot() { # id width height output
  "$chrome" --no-sandbox --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --virtual-time-budget=2000 \
    --window-size="$2,$3" --screenshot="$4" "file://$dir/src/cards.html#$1" 2>/dev/null
}
mkdir -p "$dir/x-telegram-1600x900" "$dir/medium-1400x788" "$dir/instagram-1080x1350"
shot x 1600 900 "$dir/x-telegram-1600x900/arl-week-recap-audit.png"
shot medium 1400 788 "$dir/medium-1400x788/arl-audit-medium-cover.png"
for i in 1 2 3 4 5; do shot "ig$i" 1080 1350 "$dir/instagram-1080x1350/arl-audit-$i.png"; done
