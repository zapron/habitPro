-- Stable mission timezone for calendar-day main missions.
-- New rows use this to reset at the mission owner's / creator's local midnight.
-- Existing rows intentionally remain null so legacy rolling-window missions are not migrated.

alter table public.habits
  add column if not exists mission_timezone text;

comment on column public.habits.mission_timezone is
  'IANA timezone captured at mission creation. When set, main mission days reset at local midnight with creation-day grace.';
