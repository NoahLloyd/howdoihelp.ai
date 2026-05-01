#!/usr/bin/env bash
#
# install-schedule.sh - Install a launchd job that runs the v2 evaluator
# re-verification on a schedule, using the user's Claude Code subscription.
#
# Run:    bash scripts/eval-cron/install-schedule.sh
# Verify: launchctl list | grep howdoihelpai
# Logs:   ~/Library/Logs/howdoihelpai-evaluate.log
# Remove: bash scripts/eval-cron/install-schedule.sh --uninstall
#
# Behaviour
# ---------
# - Triggers daily at 03:00. The script itself enforces a ≥36h gap between
#   real runs, so on a daily-trigger plus 36h guard you get an actual run
#   roughly every 2 days, with automatic catch-up if the Mac was asleep.
# - Runs at Background priority and low IO so it stays out of your way.
# - Uses CLAUDE_PROVIDER=cli, so calls hit your Claude Code subscription
#   (Max 20x quota), not the paid API.
# - Logs to ~/Library/Logs/howdoihelpai-evaluate.log
#
# Notes
# -----
# - The Mac must be awake at the trigger time, OR awake within a few hours
#   afterwards (launchd will run missed jobs on next wake). Closing the lid
#   counts as asleep.
# - The login keychain must be unlocked for `claude` to read the
#   subscription OAuth token. It's auto-unlocked at login, so this works
#   as long as you've logged in since boot.

set -euo pipefail

LABEL="com.howdoihelpai.evaluate"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG="$HOME/Library/Logs/howdoihelpai-evaluate.log"
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"

if [[ "${1:-}" == "--uninstall" ]]; then
  if [[ -f "$PLIST" ]]; then
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✅ Uninstalled ${LABEL}"
  else
    echo "Nothing to uninstall: ${PLIST} does not exist."
  fi
  exit 0
fi

# Resolve full paths to the binaries we need. launchd runs with a tiny PATH,
# so we hardcode absolute paths into the plist.
NPX_BIN="$( command -v npx || true )"
if [[ -z "$NPX_BIN" ]]; then
  echo "ERROR: 'npx' not found on PATH. Install Node.js first." >&2
  exit 1
fi
SHELL_BIN="${SHELL:-/bin/zsh}"

mkdir -p "$(dirname "$LOG")"
mkdir -p "$(dirname "$PLIST")"

# Build the plist. We invoke the user's login shell to source any nvm/bun/
# pyenv/etc. that lives in their dotfiles, then run the eval script.
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${SHELL_BIN}</string>
        <string>-l</string>
        <string>-c</string>
        <string>cd "${PROJECT_DIR}" &amp;&amp; npx tsx scripts/eval-cron/run-all.ts</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>StandardOutPath</key>
    <string>${LOG}</string>
    <key>StandardErrorPath</key>
    <string>${LOG}</string>
    <key>ProcessType</key>
    <string>Background</string>
    <key>LowPriorityIO</key>
    <true/>
    <key>Nice</key>
    <integer>10</integer>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST

# Bootout (modern equivalent of unload) any old version, then bootstrap.
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "✅ Installed ${LABEL}"
echo "   plist:   $PLIST"
echo "   project: $PROJECT_DIR"
echo "   log:     $LOG"
echo
echo "Schedule: every other day at 03:00 (daily fire + 47h floor inside the script)."
echo
echo "Next steps:"
echo "  1. Smoke test now (small): cd \"$PROJECT_DIR\" && CLAUDE_PROVIDER=cli npx tsx scripts/eval-cron/reverify.ts --force --limit 3"
echo "  2. Tail the live log:      tail -f \"$LOG\""
echo "  3. Trigger a real run now: launchctl kickstart -k gui/\$(id -u)/${LABEL}"
echo "  4. Reports land in:        $PROJECT_DIR/.context/eval-reports/"
echo "  5. Uninstall:              bash scripts/eval-cron/install-schedule.sh --uninstall"
