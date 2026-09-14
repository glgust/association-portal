#!/bin/sh

set -eu

REPOSITORY_ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd -P)
TEST_ROOT=${TMPDIR:-/tmp}/ascnucc-deploy-test-$$
MOCK_BIN="$TEST_ROOT/bin"
CONFIG_ROOT="$TEST_ROOT/config"
MOCK_LOG="$TEST_ROOT/docker.log"

cleanup() {
  case "$TEST_ROOT" in
    */ascnucc-deploy-test-[0-9]*) rm -rf "$TEST_ROOT" ;;
    *) printf 'refusing to remove unexpected test path: %s\n' "$TEST_ROOT" >&2 ;;
  esac
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$MOCK_BIN" "$CONFIG_ROOT"
chmod 700 "$CONFIG_ROOT"

cat > "$MOCK_BIN/docker" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$MOCK_DOCKER_LOG"

if [ "${1:-}" = --config ]; then
  shift 2
fi

case "${1:-} ${2:-}" in
  'compose version')
    printf '2.30.0\n'
    ;;
  'manifest inspect')
    printf '{}\n'
    ;;
  'image inspect')
    ref=
    for argument in "$@"; do ref=$argument; done
    case "$ref" in
      *association-portal-web*) component=web ;;
      *association-portal-cms*) component=cms ;;
      *) component=unknown ;;
    esac
    printf 'v1.2.3|1111111111111111111111111111111111111111|%s|ghcr.io/YOUR_GITHUB_ACCOUNT/association-portal-%s@sha256:%064d|amd64\n' "$component" "$component" 1
    ;;
  'info '|'info --format')
    if [ "${2:-}" = --format ]; then printf '%s\n' "$MOCK_DOCKER_ROOT"; fi
    ;;
  'ps --filter')
    ;;
  'network inspect'|'volume inspect')
    [ -n "${MOCK_RESOURCE_OWNER:-}" ] || exit 1
    printf '%s\n' "$MOCK_RESOURCE_OWNER"
    ;;
  'pull ghcr.io/'*)
    [ "${MOCK_PULL_FAIL:-no}" != yes ] || exit 23
    printf 'pulled %s\n' "${2:-}"
    ;;
  'login ghcr.io')
    IFS= read -r ignored
    ;;
  'compose --env-file')
    case "$*" in
      *' logs '*) printf 'PAYLOAD_SECRET=%s DATABASE_URL=%s\n' "$PAYLOAD_SECRET" "$DATABASE_URL" ;;
      *) printf 'compose ok\n' ;;
    esac
    ;;
  *)
    case "${1:-}" in
      info) ;;
      ps) ;;
      pull) printf 'pulled %s\n' "${2:-}" ;;
      *) printf 'unexpected docker invocation: %s\n' "$*" >&2; exit 1 ;;
    esac
    ;;
esac
EOF
chmod 700 "$MOCK_BIN/docker"

write_config() {
  roles=$1
  environment=$2
  storage=${3:-docker}
  data_root=${4:-}
  mkdir -p "$CONFIG_ROOT"
  chmod 700 "$CONFIG_ROOT"
  cat > "$CONFIG_ROOT/deploy.env" <<EOF
ASCNUCC_CONFIG_SCHEMA=1
ASCNUCC_DEPLOYMENT_ID=ascnucc-a1b2c3d4e5f6
ASCNUCC_COMPOSE_PROJECT=ascnucc_a1b2c3d4e5f6
ASCNUCC_ENVIRONMENT=$environment
ASCNUCC_ROLES=$roles
ASCNUCC_RELEASE=latest
ASCNUCC_IMAGE_OWNER=YOUR_GITHUB_ACCOUNT
ASCNUCC_REGISTRY_USERNAME=deploy-reader
ASCNUCC_REGISTRY_AUTH_MODE=system
ASCNUCC_APP_BIND_IP=127.0.0.1
ASCNUCC_DATA_BIND_IP=127.0.0.1
ASCNUCC_WEB_PORT=3000
ASCNUCC_CMS_PORT=3001
ASCNUCC_POSTGRES_PORT=5432
ASCNUCC_MINIO_PORT=9000
ASCNUCC_MINIO_CONSOLE_PORT=9001
ASCNUCC_DATA_STORAGE=$storage
ASCNUCC_DATA_ROOT=$data_root
ASCNUCC_POSTGRES_DATA_SOURCE=postgres_data
ASCNUCC_MINIO_DATA_SOURCE=minio_data
ASCNUCC_POSTGRES_IMAGE=postgres:17.11-alpine3.23
ASCNUCC_MINIO_IMAGE=minio/minio:test
ASCNUCC_MC_IMAGE=minio/mc:test
DATABASE_URL=postgres://ascnucc:redacted-db@postgres:5432/ascnucc_demo_dev
PAYLOAD_SECRET=redacted-payload
POSTGRES_DB=ascnucc_demo_dev
POSTGRES_USER=ascnucc
POSTGRES_PASSWORD=redacted-db
MEDIA_S3_ENDPOINT=http://minio:9000
MEDIA_S3_REGION=us-east-1
MEDIA_S3_BUCKET=ascnucc-media
MEDIA_S3_ACCESS_KEY_ID=ascnucc-test
MEDIA_S3_SECRET_ACCESS_KEY=redacted-s3
MEDIA_S3_FORCE_PATH_STYLE=true
MINIO_ROOT_USER=root-test
MINIO_ROOT_PASSWORD=redacted-minio
CMS_API_URL=http://cms:3001
DEMO_ADMIN_USERNAME=demo-owner
DEMO_ADMIN_PASSWORD=redacted-owner
DEMO_STAFF_USERNAME=demo-staff
DEMO_STAFF_PASSWORD=redacted-staff
DEMO_CADRE_USERNAME=demo-cadre
DEMO_CADRE_PASSWORD=redacted-cadre
EOF
  chmod 600 "$CONFIG_ROOT/deploy.env"
}

write_state() {
  cat > "$CONFIG_ROOT/state.env" <<'EOF'
ASCNUCC_ACTIVE_RELEASE_REQUEST=v1.0.0
ASCNUCC_ACTIVE_VERSION=v1.0.0
ASCNUCC_ACTIVE_REVISION=0000000000000000000000000000000000000000
ASCNUCC_MIGRATED_REVISION=0000000000000000000000000000000000000000
ASCNUCC_WEB_IMAGE=ghcr.io/YOUR_GITHUB_ACCOUNT/association-portal-web@sha256:old
ASCNUCC_CMS_IMAGE=ghcr.io/YOUR_GITHUB_ACCOUNT/association-portal-cms@sha256:old
EOF
  chmod 600 "$CONFIG_ROOT/state.env"
}

run_deploy() {
  PATH="$MOCK_BIN:$PATH" \
  MOCK_DOCKER_LOG="$MOCK_LOG" \
  MOCK_DOCKER_ROOT="$TEST_ROOT" \
  ASCNUCC_CONFIG_DIR="$CONFIG_ROOT" \
  "$REPOSITORY_ROOT/deploy" "$@"
}

run_with_foreign_resource() {
  MOCK_RESOURCE_OWNER=another-deployment run_deploy "$@"
}

assert_fails() {
  if "$@" >/dev/null 2>&1; then
    printf 'expected failure: %s\n' "$*" >&2
    exit 1
  fi
}

run_deploy help | grep -q 'update \[release\]'

write_config web,cms,data demo
run_deploy probe | grep -q 'Probe passed'

assert_fails run_with_foreign_resource probe

write_config webcms demo
assert_fails run_deploy probe

write_config web,cms,data production
assert_fails run_deploy seed --demo

write_config web,cms,data demo
write_state
run_deploy update > "$TEST_ROOT/update.out"
grep -q 'Update complete: v1.2.3' "$TEST_ROOT/update.out"
grep -q '^ASCNUCC_ACTIVE_VERSION=v1.2.3$' "$CONFIG_ROOT/state.env"
grep -q '^ASCNUCC_ACTIVE_REVISION=1111111111111111111111111111111111111111$' "$CONFIG_ROOT/state.env"

write_state
run_deploy update v1.2.3 > "$TEST_ROOT/exact-update.out"
grep -q 'Update complete: v1.2.3' "$TEST_ROOT/exact-update.out"
grep -q '^ASCNUCC_ACTIVE_RELEASE_REQUEST=v1.2.3$' "$CONFIG_ROOT/state.env"

write_state
: > "$MOCK_LOG"
assert_fails run_deploy update v1.2.4
grep -q '^ASCNUCC_ACTIVE_VERSION=v1.0.0$' "$CONFIG_ROOT/state.env"
if grep -q ' run --rm .*migrate' "$MOCK_LOG"; then
  printf 'migration ran for mismatched exact release metadata\n' >&2
  exit 1
fi

write_state
: > "$MOCK_LOG"
if PATH="$MOCK_BIN:$PATH" MOCK_DOCKER_LOG="$MOCK_LOG" MOCK_DOCKER_ROOT="$TEST_ROOT" MOCK_PULL_FAIL=yes \
  ASCNUCC_CONFIG_DIR="$CONFIG_ROOT" "$REPOSITORY_ROOT/deploy" update >/dev/null 2>&1; then
  printf 'expected failed image pull\n' >&2
  exit 1
fi
grep -q '^ASCNUCC_ACTIVE_VERSION=v1.0.0$' "$CONFIG_ROOT/state.env"
if grep -q ' run --rm .*migrate' "$MOCK_LOG"; then
  printf 'migration ran after a failed image pull\n' >&2
  exit 1
fi

mkdir "$CONFIG_ROOT/update.lock"
assert_fails run_deploy update
rmdir "$CONFIG_ROOT/update.lock"

run_deploy seed --demo > "$TEST_ROOT/seed.out"
grep -q 'Fictional Demo data is ready' "$TEST_ROOT/seed.out"

run_deploy logs cms > "$TEST_ROOT/logs.out"
grep -q '\[REDACTED\]' "$TEST_ROOT/logs.out"
if grep -q 'redacted-payload\|redacted-db' "$TEST_ROOT/logs.out"; then
  printf 'log redaction failed\n' >&2
  exit 1
fi

write_config web,cms,data demo bind /
assert_fails run_deploy probe

printf 'deploy tool verification passed\n'
