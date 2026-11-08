#!/usr/bin/env bash
# One command to ship to production: push pending Supabase migrations, then
# publish a production OTA. Migrations go first so new JS never talks to an
# old schema. .env.local (written by dev:local, points at the local database)
# is moved aside for the OTA and always put back, even if a step fails.
#
#   npm run ship:production -- "What changed"
set -euo pipefail

cd "$(dirname "$0")/.."

message="${1:-}"
if [[ -z "$message" ]]; then
  echo 'Usage: npm run ship:production -- "What changed"' >&2
  exit 1
fi

echo "== 1/2 Supabase migrations (production) =="
npm run db:push

backup=""
restore_env() {
  if [[ -n "$backup" && -f "$backup" ]]; then
    mv "$backup" .env.local
    echo "Restored .env.local"
  fi
}
trap restore_env EXIT

if [[ -f .env.local ]]; then
  backup="$(mktemp -t habitpro-env-local)"
  mv .env.local "$backup"
fi

echo "== 2/2 Production OTA =="
npm run update:production -- --message "$message"
