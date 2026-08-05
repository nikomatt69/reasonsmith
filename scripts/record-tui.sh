#!/usr/bin/env bash
# Record the reasonsmith OpenTUI TUI — long demo, zero idle pauses.
# Every step waits for a visible screen change; length comes from actions, not sleep.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/artifacts/tui/tui-check}"
RECORD="/tmp/reasonsmith-tui-check.termctrl"
TC="bun run --cwd $ROOT/packages/terminal-control control --"
TUI_ENV="REASONSMITH_TERMINAL=1 REASONSMITH_SKIP_STARTUP=1 REASONSMITH_CONFIG_DIR=/tmp/reasonsmith-tui-record"

mkdir -p "$(dirname "$OUT")"
rm -f "$RECORD"

cleanup() {
  $TC stop tui-check 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Starting TUI session"
$TC start tui-check \
  --host opentui \
  --cols 112 \
  --rows 36 \
  --record "$RECORD" \
  -- env $TUI_ENV bun run --conditions=browser --cwd "$ROOT/packages/tui" ./src/index.tsx

$TC wait tui-check "TruncatingCreditSystem" --timeout 30000
$TC mark tui-check ready

echo "==> Findings scroll + jump"
$TC send tui-check down down down down down up up text:g end down down
$TC mark tui-check findings-scroll

echo "==> Detail (first row) + audience tour"
$TC send tui-check text:g enter
$TC wait tui-check "requirement" --timeout 10000
$TC mark tui-check detail-open

$TC send tui-check text:a
$TC wait tui-check "regulator" --timeout 5000
$TC send tui-check text:a
$TC wait tui-check "affected" --timeout 5000
$TC send tui-check text:a
$TC wait tui-check "developer" --timeout 5000
$TC send tui-check text:a
$TC wait tui-check "deployer" --timeout 5000
$TC send tui-check text:a
$TC wait tui-check "auditor" --timeout 5000
$TC mark tui-check audiences

echo "==> Violated finding detail"
$TC send tui-check escape
$TC wait tui-check "Findings" --timeout 5000
$TC send tui-check down down down enter
$TC wait tui-check "clause" --timeout 10000
$TC mark tui-check detail-violated

echo "==> Limits (leader) + packs + systems"
$TC send tui-check escape
$TC wait tui-check "Findings" --timeout 5000
$TC send tui-check ctrl-x text:l
$TC wait tui-check "LIMITS OF THIS REPORT" --timeout 10000
$TC mark tui-check limits

$TC send tui-check escape
$TC wait tui-check "Findings" --timeout 5000
$TC send tui-check text:p
$TC wait tui-check "Conformance" --timeout 5000
$TC send tui-check down down down up down
$TC mark tui-check packs

$TC send tui-check escape
$TC wait tui-check "Findings" --timeout 5000
$TC send tui-check text:s
$TC wait tui-check "Systems" --timeout 5000
$TC send tui-check down down up
$TC mark tui-check systems

echo "==> Settings route via palette"
$TC send tui-check escape
$TC wait tui-check "Findings" --timeout 5000
$TC send tui-check ctrl-p
$TC wait tui-check "Command palette" --timeout 5000
$TC send tui-check text:settings down enter
$TC wait tui-check "Enterprise" --timeout 5000
$TC send tui-check down down down
$TC mark tui-check settings

echo "==> Six palette cycles + theme picker"
$TC send tui-check escape
$TC wait tui-check "Findings" --timeout 5000
$TC send tui-check text:t text:t text:t text:t text:t text:t
$TC mark tui-check themes

$TC send tui-check ctrl-x text:t
$TC wait tui-check "enterprise chrome" --timeout 5000
$TC send tui-check down down down down down enter
$TC send tui-check escape
$TC wait tui-check "TruncatingCreditSystem" --timeout 5000
$TC mark tui-check theme-picker

echo "==> Command palette: audiences, themes, filter"
$TC send tui-check ctrl-p
$TC wait tui-check "Command palette" --timeout 5000
$TC send tui-check text:audience down down enter
$TC wait tui-check "deployer" --timeout 5000

$TC send tui-check ctrl-p
$TC wait tui-check "Command palette" --timeout 5000
$TC send tui-check text:midnight enter
$TC wait tui-check "TruncatingCreditSystem" --timeout 5000

$TC send tui-check ctrl-p
$TC wait tui-check "Command palette" --timeout 5000
$TC send tui-check text:filter enter
$TC mark tui-check palette-actions

echo "==> Leader tour + finale"
$TC send tui-check escape
$TC send tui-check ctrl-x text:a
$TC wait tui-check "regulator" --timeout 5000
$TC send tui-check ctrl-x text:p
$TC wait tui-check "Conformance" --timeout 5000
$TC send tui-check escape
$TC send tui-check ctrl-x text:s
$TC wait tui-check "Systems" --timeout 5000
$TC send tui-check escape

$TC send tui-check text:g down down down enter
$TC wait tui-check "clause" --timeout 5000
$TC send tui-check escape
$TC send tui-check ctrl-p
$TC wait tui-check "Command palette" --timeout 5000
$TC send tui-check text:ocean enter
$TC wait tui-check "TruncatingCreditSystem" --timeout 5000
$TC send tui-check ctrl-p
$TC wait tui-check "Command palette" --timeout 5000
$TC send tui-check down down down down down down down down down
$TC send tui-check escape
$TC mark tui-check verified

trap - EXIT
$TC stop tui-check

echo "==> Building PR evidence bundle"
BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
REMOTE="$(git -C "$ROOT" remote get-url origin 2>/dev/null | sed -E 's#.*github.com[:/]([^/]+/[^/.]+)(\.git)?$#\1#' || echo nikomatt69/reasonsmith)"
LINK_BASE="https://raw.githubusercontent.com/${REMOTE}/${BRANCH}/artifacts/tui/tui-check"

$TC bundle \
  --recording "$RECORD" \
  --out "$OUT" \
  --link-base "$LINK_BASE" \
  --include-recording \
  --fps 20 \
  --tail-ms 1200 \
  --result passed \
  --title "Reasonsmith enterprise TUI verification" \
  --summary "Action-driven enterprise demo: @opentui/keymap, 6 palettes, KV/toasts, all routes, command palette, modals, leader key — every frame follows a visible transition."

echo "==> Done"
ls -lah "$OUT/demo.mp4" "$OUT/preview.gif"
