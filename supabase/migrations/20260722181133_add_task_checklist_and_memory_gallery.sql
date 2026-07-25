-- Phase 0 of docs/CATALOG_ARCHITECTURE.md — additive, nullable columns for the
-- multi-task daily memory/catalog feature. No existing row or existing app
-- version is affected: nothing reads or writes these columns yet.
--
-- NOTE: this migration mirrors a change already applied directly to the
-- production database on 2026-07-22 (before the "migrations must go through
-- tracked files" rule was set). It uses IF NOT EXISTS, so running it against
-- the live database is a safe no-op; it exists so the change is properly
-- tracked in version control going forward.

alter table public.habits
  add column if not exists task_checklist jsonb;

comment on column public.habits.task_checklist is
  'Optional ordered list of sub-tasks for this mission: [{id, label, order}]. Null/empty means the mission uses the classic single note+photo memory flow unchanged.';

alter table public.community_wins
  add column if not exists memory_gallery jsonb;

comment on column public.community_wins.memory_gallery is
  'Optional per-task photo catalog for a habit_streak post: [{taskId, label, note, imageUrl}]. When present, clients should render it as a swipeable gallery; memory_note/memory_image_url stay populated as the cover/first entry for backward compatibility.';
