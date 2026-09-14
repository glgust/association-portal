#!/usr/bin/env bash
set -euo pipefail

# Run only after the source, database and browser checks have succeeded.
[[ "${GITHUB_ACTIONS:-}" == true ]]
[[ "$GITHUB_REPOSITORY" == glgust/association-portal ]]
[[ "$GITHUB_REF" == refs/heads/main ]]
[[ "$(node -p "require('./package.json').version")" == 1.0.0 ]] || exit 0

current_head=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq .object.sha)
if [[ "$current_head" != "$GITHUB_SHA" ]]; then
  echo 'A newer main commit is being checked; leave the first release to that run.'
  exit 0
fi

existing_release=$(gh api "repos/$GITHUB_REPOSITORY/releases" --paginate \
  --jq '.[] | select(.tag_name == "v1.0.0")')
existing_tag=$(git ls-remote origin refs/tags/v1.0.0)
if [[ -n "$existing_tag" ]]; then
  git fetch --no-tags origin refs/tags/v1.0.0
  tagged_commit=$(git rev-parse 'FETCH_HEAD^{commit}')
  if [[ "$tagged_commit" != "$GITHUB_SHA" ]]; then
    echo 'v1.0.0 already names another commit; preserve the published version.'
    exit 0
  fi
elif [[ -n "$existing_release" ]]; then
  echo '::error::An existing release has no tag; inspect it before publishing.'
  exit 1
fi

if [[ -n "$existing_release" ]]; then
  jq -e '.prerelease == true and .draft == false' <<< "$existing_release" >/dev/null
else
  python3 - <<'PY'
import os
import re
from pathlib import Path
from urllib.parse import urljoin

repo = os.environ['GITHUB_REPOSITORY']
sha = os.environ['GITHUB_SHA']
base = f'https://github.com/{repo}/blob/{sha}/docs/releases/v1.0.0.md'
notes = Path('docs/releases/v1.0.0.md').read_text()
notes = re.sub(r'\[([^\]]+)\]\(([^)]+)\)',
               lambda m: f'[{m[1]}]({urljoin(base, m[2])})', notes)
run = os.environ['GITHUB_RUN_ID']
notes += f'\n源码、测试数据库迁移与浏览器流程：[本次 CI 验证记录](https://github.com/{repo}/actions/runs/{run})。\n'
notes += '\n容器镜像另行构建，实际可用性以镜像发布作业结果为准。\n'
Path(os.environ['RUNNER_TEMP'], 'first-test-release.md').write_text(notes)
PY
  gh release create v1.0.0 --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" \
    --prerelease --latest=false --title 'v1.0.0 · 首个测试版' \
    --notes-file "$RUNNER_TEMP/first-test-release.md"
fi

# Releases created by GITHUB_TOKEN do not trigger release-event workflows.
gh workflow run publish-images.yml --repo "$GITHUB_REPOSITORY" --ref main \
  -f release_tag=v1.0.0
echo 'v1.0.0 prerelease is available; its image build has been requested.'
