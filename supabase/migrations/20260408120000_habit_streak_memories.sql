-- Per–check-in streak memories (photo URI + note), JSON map keyed by YYYY-MM-DD.
alter table public.habits
  add column if not exists streak_memories jsonb not null default '{}'::jsonb;
