-- Mark Community wins that came from Live Squad mini missions.
-- The public feed can read this from community_wins directly without exposing squad participants.

alter table public.community_wins
  add column if not exists live_squad_id uuid null
    references public.live_mini_squads (id) on delete set null;

comment on column public.community_wins.live_squad_id is
  'Non-null when a Community mini mission win came from a Live Squad. Used only for the feed badge.';

create index if not exists community_wins_live_squad_id_idx
  on public.community_wins (live_squad_id)
  where live_squad_id is not null;

update public.community_wins cw
set live_squad_id = mm.live_squad_id
from public.mini_missions mm
where cw.live_squad_id is null
  and coalesce(cw.feed_source, 'mini') = 'mini'
  and cw.user_id = mm.user_id
  and cw.mini_mission_id = mm.id
  and mm.live_squad_id is not null;
