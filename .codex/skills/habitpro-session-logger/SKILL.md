---
name: habitpro-session-logger
description: Update HabitPro end-of-session handoff documentation. Use when a HabitPro development session is ending, when the user asks to log today's work, when moving between machines, after phased commits, after OTA/build attempts, or whenever Codex needs to record current status, validation, open risks, and next steps in repo docs.
---

# HabitPro Session Logger

## Overview

Use this skill to leave the repo in a resumable state. It updates the durable handoff docs without relying on chat history.

## Workflow

1. Inspect current state:
   - `git status --short`
   - `git --no-pager log --oneline -8`
   - `git diff --stat`
2. Identify what changed since the last log entry:
   - commits created
   - files changed but not committed
   - validation run
   - blocked commands or external actions the user must run locally
   - active investigations and next recommended experiment
3. Audit Markdown docs so stale repo knowledge is not forgotten:
   - run `rg --files -g '*.md' -g '!node_modules'`
   - review the file list against the session changes
   - read and update every Markdown file whose scope was affected
   - do not bulk-edit unrelated docs just because they exist
4. Update `docs/CURRENT_WORK.md`:
   - set `Last updated` to today's date
   - record current worktree state
   - list recent commits relevant to the session
   - keep unresolved work clearly marked as not fixed
5. Append to `docs/WORK_HISTORY.md`:
   - date
   - commits
   - what changed
   - validation
   - open risks / next steps
6. Update architecture docs only when cross-cutting behavior changed:
   - `docs/PROJECT_CONTEXT.md` for compact high-level decisions
   - `app-architecture.md` for architectural maps and caution points
   - `docs/FUTURE_AGENT_HANDOFF.md` for next-agent instructions
   - feature playbooks such as `docs/IOS_BUILD_PLAYBOOK.md` only when relevant
7. Never log secrets:
   - no `.env` values
   - no service-role keys
   - no Apple private keys/certs
   - no user data
8. Validate docs/skill changes:
   - run `npx tsc --noEmit` if code changed during the session
   - run `git diff --check`
   - run the skill validator if this skill changed

## Logging Standards

- Be concise and factual.
- Prefer commit hashes and file paths over vague summaries.
- Mark assumptions and unresolved issues explicitly.
- Separate product decisions from technical implementation.
- Keep local workspace noise out of commits unless the user asks.

## Commit Guidance

- Do not commit automatically unless the user asks.
- If committing docs, keep workspace files like `.claude/`, `.code-workspace`, and scratch notes out unless explicitly requested.
- If an OTA/build was attempted but blocked, log the exact command and the reason it was not completed.
