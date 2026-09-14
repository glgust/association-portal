#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
release_repo=${1:?Usage: scripts/publish-initial-release.sh OWNER/association-portal}
[[ "$release_repo" =~ ^[A-Za-z0-9-]+/association-portal$ ]] || { echo 'Expected OWNER/association-portal'; exit 1; }
command -v gh >/dev/null || { echo 'Install GitHub CLI and authenticate with gh auth login first.'; exit 1; }
gh auth status
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit or review local changes first.'; exit 1; }
[[ "$(git rev-list --all --count)" == 1 ]] || { echo 'This initial release requires a single clean source snapshot commit.'; exit 1; }
[[ -z "$(git remote)" ]] || { echo 'A remote is already configured; inspect it manually before publishing.'; exit 1; }
[[ -z "$(git tag --list)" ]] || { echo 'Unexpected existing tags; inspect them before publishing.'; exit 1; }
gh repo create "$release_repo" --public --source . --remote origin --push \
  --description 'Association portal · v1.0.0 first test release; not validated by long-term production use'
git tag -a v1.0.0 -m 'v1.0.0: first test release; no long-term production validation'
git push origin v1.0.0
gh release create v1.0.0 --repo "$release_repo" --verify-tag --prerelease \
  --title 'v1.0.0 · 首个测试版' --notes-file docs/releases/v1.0.0.md
echo 'Source prerelease created. Verify Actions and GHCR package visibility before advertising images.'
