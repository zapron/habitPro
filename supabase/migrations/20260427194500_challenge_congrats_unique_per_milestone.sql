-- Congrats should be one-time per milestone (activity row), not once per day.
-- Add optional activity_id pointer and adjust uniqueness rules accordingly.

alter table public.challenge_nudges
  add column if not exists activity_id uuid references public.challenge_activity (id) on delete cascade;

-- Old index limits all nudges (including congrats) to once per UTC day between two users.
drop index if exists public.challenge_nudges_one_per_day_idx;

-- Rate limit for non-congrats nudges remains once per UTC day.
create unique index if not exists challenge_nudges_one_per_day_non_congrats_idx
  on public.challenge_nudges (
    challenge_id,
    from_user_id,
    to_user_id,
    kind,
    ((created_at at time zone 'utc')::date)
  )
  where kind <> 'congrats';

-- Congrats: one-time per milestone row.
create unique index if not exists challenge_nudges_congrats_once_per_activity_idx
  on public.challenge_nudges (
    challenge_id,
    from_user_id,
    to_user_id,
    kind,
    activity_id
  )
  where kind = 'congrats' and activity_id is not null;

