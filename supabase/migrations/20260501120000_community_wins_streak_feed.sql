-- Streak memory wins: source + streak context for feed UI and cheer notification copy.

alter table public.community_wins
  add column if not exists feed_source text not null default 'mini'
    check (feed_source in ('mini', 'habit_streak'));

alter table public.community_wins
  add column if not exists streak_mission_day integer null;

alter table public.community_wins
  add column if not exists streak_count_at_post integer null;

comment on column public.community_wins.feed_source is 'mini = mini mission completion; habit_streak = main mission streak memory';
comment on column public.community_wins.streak_mission_day is '1-based mission day index when feed_source = habit_streak';
comment on column public.community_wins.streak_count_at_post is 'Consecutive streak count when the win was published';

create or replace function public.notify_community_win_cheer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  win_owner uuid;
  win_title text;
  cheerer_name text;
  v_feed_source text;
  v_streak_day int;
  v_streak_count int;
begin
  select
    cw.user_id,
    cw.title,
    coalesce(cw.feed_source, 'mini'),
    cw.streak_mission_day,
    cw.streak_count_at_post
  into win_owner, win_title, v_feed_source, v_streak_day, v_streak_count
  from public.community_wins cw
  where cw.id = new.win_id;

  if win_owner is null then
    return new;
  end if;

  if new.user_id = win_owner then
    return new;
  end if;

  select coalesce(nullif(trim(p.username::text), ''), null)
  into cheerer_name
  from public.profiles p
  where p.id = new.user_id;

  insert into public.notifications (user_id, type, payload)
  values (
    win_owner,
    'community_win_cheer',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'community_win_cheer',
      'win_id', new.win_id,
      'cheer_id', new.id,
      'from_user_id', new.user_id,
      'from_username', coalesce(cheerer_name, 'someone'),
      'mini_mission_title', coalesce(win_title, 'Mini mission'),
      'feed_source', v_feed_source,
      'streak_mission_day', v_streak_day,
      'streak_count_at_post', v_streak_count,
      'created_at', new.created_at
    )
  );

  return new;
end;
$$;
