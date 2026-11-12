#!/usr/bin/env bash
# Production OTA only: no Supabase step. Use when this release has no new
# migration (otherwise use `npm run ship:production`, which pushes migrations
# first so new JS never talks to an old schema).
# .env.local (written by dev:local, points at the local database) is moved
# aside for the OTA and always put back, even if a step fails.
#
#   npm run ota:production -- "What changed"
set -euo pipefail

cd "$(dirname "$0")/.."

message="${1:-}"
if [[ -z "$message" ]]; then
  echo 'Usage: npm run ota:production -- "What changed"' >&2
  exit 1
fi

# Cheap guard: stop if migration files are new or modified in the working
# tree. It can't see whether committed migrations reached production;
# ship:production (db push) is the check for that.
pending="$(git status --porcelain -- supabase/migrations)"
if [[ -n "$pending" ]]; then
  echo "Uncommitted migration changes found:" >&2
  echo "$pending" >&2
  echo "If these need to reach production, run: npm run ship:production -- \"$message\"" >&2
  exit 1
fi

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

echo "== Production OTA (no database step) =="
npm run update:production -- --message "$message"
