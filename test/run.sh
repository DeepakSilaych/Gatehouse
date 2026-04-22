#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
COOKIE_FILE="/tmp/gatehouse-test-cookies"

R1="--resolve auth.local.test:80:127.0.0.1"
R2="--resolve app.local.test:80:127.0.0.1"
R3="--resolve public.local.test:80:127.0.0.1"

c() {
  curl -s $R1 $R2 $R3 "$@"
}

assert_status() {
  local desc="$1" expected="$2"
  shift 2
  local status
  status=$(c -o /dev/null -w "%{http_code}" "$@" 2>/dev/null || echo "000")
  if [ "$status" = "$expected" ]; then
    echo -e "  ${GREEN}PASS${NC} $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $desc (expected $expected, got $status)"
    FAIL=$((FAIL + 1))
  fi
}

assert_body() {
  local desc="$1" expected="$2"
  shift 2
  local body
  body=$(c "$@" 2>/dev/null || echo "")
  if echo "$body" | grep -q "$expected"; then
    echo -e "  ${GREEN}PASS${NC} $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $desc (expected: $expected)"
    echo -e "       got: ${body:0:200}"
    FAIL=$((FAIL + 1))
  fi
}

wait_ready() {
  local max=60 n=0
  echo -n "  Waiting for services"
  while [ $n -lt $max ]; do
    if c -o /dev/null "http://auth.local.test/health" 2>/dev/null; then
      echo -e " ${GREEN}ready${NC} (${n}s)"
      return 0
    fi
    echo -n "."
    sleep 2
    n=$((n + 2))
  done
  echo -e " ${RED}timeout${NC}"
  return 1
}

COMPOSE="docker compose -f docker-compose.yml -f test/docker-compose.test.yml"

create_config() {
  local provider="$1"
  cat > gatehouse.json <<JSONEOF
{
  "proxy": "$provider",
  "tls": false,
  "auth_domain": "auth.local.test",
  "cookie_domain": ".local.test",
  "session_hours": 1,
  "sites": [
    {
      "domain": "app.local.test",
      "upstream": "test-app:3000",
      "protected": true,
      "public_paths": ["/health", "/api/public/**"]
    },
    {
      "domain": "public.local.test",
      "upstream": "test-public:3000",
      "protected": false
    }
  ]
}
JSONEOF

  cat > .env <<ENVEOF
AUTH_DOMAIN=auth.local.test
COOKIE_DOMAIN=.local.test
JWT_SECRET=test-secret-do-not-use-in-production
SESSION_HOURS=1
DB_PATH=/data/auth.db
NODE_ENV=development
ENVEOF
}

teardown() {
  echo "  Tearing down..."
  $COMPOSE down -v --remove-orphans 2>/dev/null || true
  rm -f "$COOKIE_FILE"
}

run_tests() {
  rm -f "$COOKIE_FILE"

  echo ""
  echo -e "${CYAN}─── Health & Connectivity ───${NC}"
  assert_status "Auth health check" "200" "http://auth.local.test/health"
  assert_status "Public site no auth" "200" "http://public.local.test/"
  assert_body "Public site body" '"app":"public"' "http://public.local.test/"

  echo ""
  echo -e "${CYAN}─── Unauthenticated Access ───${NC}"
  assert_status "Protected site → 302 redirect" "302" --max-redirs 0 "http://app.local.test/"
  assert_status "Login page loads" "200" "http://auth.local.test/login"
  assert_body "Login page has form" 'action="/login"' "http://auth.local.test/login"

  echo ""
  echo -e "${CYAN}─── Login Flow ───${NC}"
  assert_status "Bad credentials → stays on login" "200" -X POST -d "username=testuser&password=wrong" --max-redirs 0 "http://auth.local.test/login"

  c -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -X POST -d "username=testuser&password=testpass&redirect=http://app.local.test/" \
    -o /dev/null --max-redirs 0 \
    "http://auth.local.test/login" 2>/dev/null || true

  if [ -f "$COOKIE_FILE" ] && grep -q "__gatehouse_token" "$COOKIE_FILE" 2>/dev/null; then
    echo -e "  ${GREEN}PASS${NC} Login sets cookie"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} Login did not set cookie"
    cat "$COOKIE_FILE" 2>/dev/null || echo "  (no cookie file)"
    FAIL=$((FAIL + 1))
  fi

  echo ""
  echo -e "${CYAN}─── Authenticated Access ───${NC}"
  assert_status "Protected site → 200 with cookie" "200" -b "$COOKIE_FILE" "http://app.local.test/"
  assert_body "Upstream gets request" '"app":"protected"' -b "$COOKIE_FILE" "http://app.local.test/"
  assert_body "X-Auth-User forwarded" '"user":"testuser"' -b "$COOKIE_FILE" "http://app.local.test/"

  echo ""
  echo -e "${CYAN}─── Public Paths ───${NC}"
  assert_status "/health public path without auth" "200" "http://app.local.test/health"
  assert_body "/health returns app content" '"app":"protected"' "http://app.local.test/health"

  echo ""
  echo -e "${CYAN}─── Dashboard & API ───${NC}"
  assert_status "Dashboard loads" "200" -b "$COOKIE_FILE" "http://auth.local.test/dashboard/"
  assert_status "GET /api/users" "200" -b "$COOKIE_FILE" -H "Accept: application/json" "http://auth.local.test/api/users"
  assert_status "GET /api/stats" "200" -b "$COOKIE_FILE" -H "Accept: application/json" "http://auth.local.test/api/stats"
  assert_status "GET /api/sites" "200" -b "$COOKIE_FILE" -H "Accept: application/json" "http://auth.local.test/api/sites"
  assert_status "GET /api/sessions" "200" -b "$COOKIE_FILE" -H "Accept: application/json" "http://auth.local.test/api/sessions"
  assert_body "Sessions has testuser" '"username":"testuser"' -b "$COOKIE_FILE" -H "Accept: application/json" "http://auth.local.test/api/sessions"

  echo ""
  echo -e "${CYAN}─── API Without Auth ───${NC}"
  assert_status "API rejects unauthenticated" "401" -H "Accept: application/json" "http://auth.local.test/api/users"

  echo ""
  echo -e "${CYAN}─── Logout ───${NC}"
  c -c "$COOKIE_FILE" -b "$COOKIE_FILE" -o /dev/null --max-redirs 0 "http://auth.local.test/logout" 2>/dev/null || true
  assert_status "Protected rejects after logout" "302" -b "$COOKIE_FILE" --max-redirs 0 "http://app.local.test/"
}

test_provider() {
  local provider="$1"
  local upper
  upper=$(echo "$provider" | tr '[:lower:]' '[:upper:]')
  echo ""
  echo -e "${YELLOW}╔══════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  Testing: ${upper}$(printf '%*s' $((24 - ${#provider})) '')║${NC}"
  echo -e "${YELLOW}╚══════════════════════════════════════╝${NC}"

  teardown

  echo "  Creating config for ${provider}..."
  create_config "$provider"

  echo "  Generating proxy configs..."
  node bin/gatehouse.js generate

  echo "  Building and starting services..."
  $COMPOSE up -d --build 2>&1 | tail -5

  if ! wait_ready; then
    echo -e "  ${RED}Failed to start. Auth service logs:${NC}"
    $COMPOSE logs auth-service 2>/dev/null | tail -20
    echo -e "  ${RED}Proxy logs:${NC}"
    $COMPOSE logs "$provider" 2>/dev/null | tail -20
    teardown
    return 1
  fi

  sleep 2

  echo "  Creating test user..."
  $COMPOSE exec -T auth-service node src/cli.js add testuser testpass

  run_tests

  teardown
}

echo ""
echo -e "${YELLOW}Gatehouse Integration Tests${NC}"
echo "═══════════════════════════"

if [ $# -gt 0 ]; then
  PROVIDERS=("$@")
else
  PROVIDERS=(caddy nginx traefik)
fi

for provider in "${PROVIDERS[@]}"; do
  test_provider "$provider"
done

echo ""
echo "═══════════════════════════"
echo -e "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo ""

rm -f gatehouse.json .env

[ $FAIL -eq 0 ]
