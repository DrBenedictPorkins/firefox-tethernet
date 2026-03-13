#!/usr/bin/env bash
# Tethernet release script
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 1.1.0
#
# What this does:
#   1. Verifies working tree is clean
#   2. Bumps version in server/package.json, package.json, extension/manifest.json
#   3. Runs tests
#   4. Builds server (TypeScript compile)
#   5. Builds extension (web-ext)
#   6. Commits version bump and tags the release
#   7. Bumps to next patch dev version and commits
#
# After running, manually:
#   git push && git push --tags
#   cd server && npm publish
#   Upload web-ext-artifacts/tethernet-<version>.zip to AMO

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

die()  { echo "ERROR: $1" >&2; exit 1; }
info() { echo "-> $1"; }
ok()   { echo "ok $1"; }

# --- Version argument ---
[ -n "${1:-}" ] || die "Version required. Usage: ./scripts/release.sh <version>  (e.g. 1.1.0)"
VERSION="$1"

# Validate semver format
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Version must be semver (e.g. 1.1.0), got: $VERSION"

info "Preparing release v$VERSION"

# --- Clean working tree ---
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Working tree has uncommitted changes. Commit or stash them before releasing."
fi
ok "Working tree clean"

# --- Bump versions ---
info "Bumping versions to $VERSION..."

bump_json_version() {
  local file="$1"
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$file', 'utf8'));
    pkg.version = '$VERSION';
    fs.writeFileSync('$file', JSON.stringify(pkg, null, 2) + '\n');
  "
  ok "  $file"
}

bump_json_version "server/package.json"
bump_json_version "package.json"
bump_json_version "extension/manifest.json"

# --- Tests ---
info "Running tests..."
cd server && npm test -- --run
cd "$ROOT"
ok "Tests passed"

# --- Build server ---
info "Building server..."
cd server && npm run build
cd "$ROOT"
ok "Server built"

# --- Build extension ---
info "Building extension..."
npm run ext:build
ok "Extension built (web-ext-artifacts/tethernet-${VERSION}.zip)"

# --- Commit & tag release ---
info "Committing release v$VERSION..."
git add server/package.json package.json extension/manifest.json
git commit -m "chore: release v$VERSION"
git tag "v$VERSION"
ok "Tagged v$VERSION"

# --- Bump to next dev version ---
IFS='.' read -r major minor patch <<< "$VERSION"
NEXT="$major.$minor.$((patch + 1))"
info "Bumping to next dev version v$NEXT..."

bump_json_version "server/package.json"
bump_json_version "package.json"
bump_json_version "extension/manifest.json"

git add server/package.json package.json extension/manifest.json
git commit -m "chore: bump to v$NEXT [dev]"
ok "Dev version set to v$NEXT"

echo ""
echo "Release v$VERSION complete. Next steps:"
echo "  git push && git push --tags"
echo "  cd server && npm publish"
echo "  Upload web-ext-artifacts/tethernet-${VERSION}.zip to AMO"
