# Pre-Migration Rules

Read this before writing, editing, or touching anything related to a
Supabase migration in this repo. This applies to every agent, in every
session, no exceptions.

## The one rule that matters most

**The agent must never apply a migration to production.** Not by running
`npm run db:push` / `supabase db push` itself, not via the
`apply_migration` MCP tool, not via `execute_sql` for anything that
changes schema or data, not through the Supabase Dashboard's SQL editor.

Every migration reaches production exactly one way: the agent writes the
migration file, tests it locally, and then **tells the user to run
`npm run db:push` themselves, in their own terminal.** The agent has
permission to run Bash commands and is technically capable of running
`db:push` directly — that capability is not permission. This rule applies
even when the change looks small, looks obviously safe, or the user
seems to be in a hurry.

If a session is ever about to run a command that would apply a migration
to the live production database, stop and ask the user to run it
instead.

## Why this rule exists

Found 2026-09-13, setting up local dev for the first time: three real,
pre-existing schema-drift bugs where production's actual live schema
disagreed with what the migration files in this repo say it should be.
Root cause in every case was the same shape — a schema or data change
made directly against production (outside any migration file, most
likely via the Dashboard SQL editor or a direct tool call) that was
never captured as a proper migration, or was backfilled into one later
with a timestamp that didn't reflect its true dependency order. None of
this was visible through normal `db push` usage — `db push` only checks
"has this migration version been applied yet" against an already-live
database, it never needs to verify anything replays correctly from
empty. Full story: `app-architecture.md`'s Known Caution Points and
`docs/WORK_HISTORY.md`'s 2026-09-13 entry.

This rule is the fix at the source: if every schema/data change is
forced through a migration file, tested locally, and applied by the
user's own explicit action, this specific failure mode cannot recur.

## What the agent can do without asking

- Read-only queries (`select ...`) against production, for diagnosis —
  checking real state, real row counts, real constraint definitions.
  Used extensively and safely throughout the 2026-09-13 session to
  confirm exactly what was live before writing any fix.
- Write and edit migration files under `supabase/migrations/`.
- Run `npm run db:start` / `db:stop` (local Docker stack only).
- Run `npm run db:reset` (wipes and replays the **local** database only —
  never touches production).
- Run `npm run db:snapshot` (reads *from* production into a local file —
  safe, read-only from production's perspective).

## What the agent must never do — always the user's action

- `npm run db:push` (this now also triggers `db:reset` automatically via
  a `predb:push` hook, but the agent still never runs it — the hook is a
  safety net for whoever does run it, not permission for the agent to be
  that person).
- The `apply_migration` MCP tool, for any reason.
- The `execute_sql` MCP tool for anything beyond a `select` — no
  `insert`/`update`/`delete`/`alter`/`create`/`drop` against production,
  ever, regardless of how small or reversible it looks.
- Any raw `psql` or connection-string-based command targeting
  production's real database host.
- Any change via the Supabase Dashboard's SQL editor or table editor.

## The workflow, every time a migration is needed

1. Write the migration file in `supabase/migrations/` with a correctly
   ordered timestamp (after whatever it depends on).
2. Run `npm run db:reset` locally and confirm it succeeds cleanly —
   this is the agent verifying its own work, not the enforcement step
   (the `predb:push` hook is that, for whoever runs `db:push`).
3. If the migration touches something that may have been changed
   directly on production historically, query production directly first
   (`select`, read-only) to confirm the real current state — don't
   assume from the migration file history alone.
4. Explain to the user, in plain language, exactly what the migration
   does and that it has been tested locally.
5. Tell the user to run `npm run db:push` themselves. Do not run it for
   them, even if asked to "just do it" — restate that this step is
   theirs, and why (this file).
6. Once the user confirms they've run it, optionally verify with a
   read-only query that it landed as expected.

## No schema or data change to production outside a migration file, ever

No Dashboard edits, no "quick fix" via a direct query, no ad-hoc table
edits via Studio. This exact pattern — a small, untracked, direct change
made "just this once" — is precisely what caused the three drift bugs
this file exists to prevent from happening again.
