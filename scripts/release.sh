#!/usr/bin/env bash
# Cut a Quacky release from the current commit.
#
#   scripts/release.sh <version> <notes.md>
#
# Before: bump the version in package.json, src-tauri/tauri.conf.json,
# src-tauri/Cargo.toml (+ Cargo.lock), commit, and push the branch.
#
# What it does:
#   1. builds HEAD in a clean worktree (ad-hoc signed, like every public build),
#      with updater artifacts signed by ~/.tauri/quacky-updater.key
#   2. creates the release in the private code repo (DMG)
#   3. creates the same release in the public feed repo with the DMG, the
#      update archive, its signature and latest.json, which installed copies
#      of Quacky read to find the update
set -euo pipefail

CODE_REPO="LieferEule/quacky"
FEED_REPO="LieferEule/quacky-releases"
KEY="${QUACKY_UPDATER_KEY:-$HOME/.tauri/quacky-updater.key}"

VERSION="${1:?usage: scripts/release.sh <version> <notes.md>}"
NOTES="${2:?usage: scripts/release.sh <version> <notes.md>}"
TAG="v$VERSION"

die() { echo "release: $*" >&2; exit 1; }

[[ -f "$KEY" ]] || die "signing key not found at $KEY"
[[ -f "$NOTES" ]] || die "notes file not found: $NOTES"
NOTES="$(cd "$(dirname "$NOTES")" && pwd)/$(basename "$NOTES")"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
SHA="$(git rev-parse HEAD)"

for f in package.json src-tauri/tauri.conf.json; do
  grep -q "\"version\": \"$VERSION\"" "$f" || die "$f is not at $VERSION"
done
grep -q "^version = \"$VERSION\"" src-tauri/Cargo.toml || die "Cargo.toml is not at $VERSION"
git fetch -q origin "+refs/heads/*:refs/remotes/origin/*"
git branch -r --contains "$SHA" | grep -q . || die "push $SHA first"
gh release view "$TAG" -R "$CODE_REPO" >/dev/null 2>&1 && die "$TAG already exists in $CODE_REPO"
gh release view "$TAG" -R "$FEED_REPO" >/dev/null 2>&1 && die "$TAG already exists in $FEED_REPO"

WORK="$(mktemp -d -t quacky-release)"
TREE="$WORK/tree"
TARGET="$WORK/target"
trap 'git -C "$ROOT" worktree remove --force "$TREE" >/dev/null 2>&1 || true' EXIT

echo "▶ clean worktree of $SHA"
git worktree add --detach "$TREE" "$SHA" >/dev/null
cd "$TREE"
bun install --frozen-lockfile
bun run verify --quick

echo "▶ build"
TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
CARGO_TARGET_DIR="$TARGET" \
  bun run tauri build --config '{"bundle":{"createUpdaterArtifacts":true}}'

BUNDLE="$TARGET/release/bundle"
DMG="$(ls "$BUNDLE"/dmg/*.dmg | head -1)"
ARCHIVE_SRC="$BUNDLE/macos/Quacky.app.tar.gz"
[[ -f "$DMG" && -f "$ARCHIVE_SRC" && -f "$ARCHIVE_SRC.sig" ]] || die "build artifacts missing in $BUNDLE"
hdiutil verify "$DMG" >/dev/null

# A versioned name, so every release keeps its own archive.
ARCHIVE="$WORK/Quacky_${VERSION}_aarch64.app.tar.gz"
cp "$ARCHIVE_SRC" "$ARCHIVE"
cp "$ARCHIVE_SRC.sig" "$ARCHIVE.sig"

echo "▶ latest.json"
python3 - "$VERSION" "$NOTES" "$ARCHIVE.sig" "$FEED_REPO" "$TAG" "$(basename "$ARCHIVE")" > "$WORK/latest.json" <<'PY'
import datetime, json, sys
version, notes, sig, repo, tag, name = sys.argv[1:]
print(json.dumps({
    "version": version,
    "notes": open(notes, encoding="utf-8").read().strip(),
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {
        "darwin-aarch64": {
            "signature": open(sig).read().strip(),
            "url": f"https://github.com/{repo}/releases/download/{tag}/{name}",
        }
    },
}, ensure_ascii=False, indent=2))
PY

echo "▶ release in $CODE_REPO"
gh release create "$TAG" "$DMG" -R "$CODE_REPO" --target "$SHA" \
  --title "Quacky $VERSION" --notes-file "$NOTES"

echo "▶ release in $FEED_REPO"
gh release create "$TAG" "$DMG" "$ARCHIVE" "$ARCHIVE.sig" "$WORK/latest.json" \
  -R "$FEED_REPO" --title "Quacky $VERSION" --notes-file "$NOTES" --latest

echo "✓ Quacky $VERSION released. Feed: https://github.com/$FEED_REPO/releases/latest/download/latest.json"
