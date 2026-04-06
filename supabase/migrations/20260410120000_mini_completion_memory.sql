-- Optional photo/note captured when completing a mini mission (syncs with app StreakMemory shape).
alter table public.mini_missions
  add column if not exists completion_memory jsonb;
