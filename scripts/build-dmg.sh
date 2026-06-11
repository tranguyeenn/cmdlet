#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/src-tauri/target/release/bundle"

cleanup_dmg_artifacts() {
  # An app launched from a mounted DMG keeps the volume's backing store busy,
  # so hdiutil attach/convert fails on the next build. Kill those instances
  # (including ones whose volume was already force-detached but still running).
  pkill -9 -f '/Volumes/dmg\.' 2>/dev/null || true
  pkill -9 -f '/Volumes/cmdlet' 2>/dev/null || true

  # Interrupted DMG builds leave rw temp images that break hdiutil.
  find "$BUNDLE" -name 'rw*.dmg' -delete 2>/dev/null || true

  # Stale final DMG outputs cause "hdiutil: convert failed - File exists".
  rm -f "$BUNDLE"/dmg/*.dmg 2>/dev/null || true
  rm -f "$BUNDLE"/macos/*.dmg 2>/dev/null || true

  # Detach stuck installer volumes.
  if command -v hdiutil >/dev/null; then
    while IFS= read -r mount; do
      [[ -z "$mount" ]] && continue
      hdiutil detach "$mount" -force >/dev/null 2>&1 || true
    done < <(hdiutil info 2>/dev/null | awk '/\/Volumes\/(cmdlet|dmg\.)/ {print $1}')
  fi
}

cleanup_dmg_artifacts

cd "$ROOT"
if npm run tauri -- build --bundles app,dmg "$@"; then
  echo ""
  echo "DMG ready:"
  echo "  $BUNDLE/dmg/cmdlet_0.1.0_aarch64.dmg"
  echo "App bundle:"
  echo "  $BUNDLE/macos/cmdlet.app"
else
  status=$?
  echo ""
  echo "DMG build failed. Cleaning leftover DMG temp files..."
  cleanup_dmg_artifacts
  echo "Retry: npm run build:dmg"
  echo "Or use the .app only: npm run tauri build  (no DMG)"
  exit "$status"
fi
