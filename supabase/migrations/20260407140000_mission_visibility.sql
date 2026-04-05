-- Public vs solo visibility for habits and mini missions (future global feed).

alter table public.habits
  add column if not exists visibility text not null default 'solo';

alter table public.mini_missions
  add column if not exists visibility text not null default 'solo';
