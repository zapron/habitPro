-- Phases 2+3 of docs/GROUP_CHALLENGE_GOVERNANCE.md: room rules.
-- Two independent booleans rather than a single "easy/medium/hard" enum —
-- Phase 2's presets are just fixed combinations of these (easy = both
-- false, medium = note only, hard = both), and Phase 3's premium "custom"
-- mode needs the fourth combination (photo required, note optional) that a
-- 3-way enum can't express. Both absent/false means "easy" — today's
-- existing behavior, a bare check-in with no memory required — so no
-- existing mission's behavior changes just from these columns existing.
--
-- Cloned client-side from challenge_groups.habit_template onto each
-- member's own habit at group-creation/accept-invite time (see
-- src/store/habitStore.ts and app/(tabs)/compete.tsx) — enforcement reads
-- these local columns, never a live lookup, so completion gating keeps
-- working fully offline.
alter table public.habits
  add column require_note boolean,
  add column require_photo boolean;
