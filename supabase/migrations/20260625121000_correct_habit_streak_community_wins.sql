-- Keep habit-streak Community win streak counts corrected after streak repairs.
--
-- Habit streak wins use mini_mission_id = habitwin:{habitId}:{YYYY-MM-DD}.
-- The app may publish while a repair is pending, so the stored streak count can
-- temporarily be too low. Once habits.completed_dates changes, recompute the
-- Community row from server truth.

create or replace function public._community_habit_win_streak_count(
  p_user_id uuid,
  p_habit_id text,
  p_date_str text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_habit_exists boolean := false;
  v_dates text[];
  v_cursor date;
  v_count integer := 0;
begin
  if p_user_id is null
    or p_habit_id is null
    or length(trim(p_habit_id)) = 0
    or p_date_str is null
    or p_date_str !~ '^\d{4}-\d{2}-\d{2}$'
  then
    return null;
  end if;

  select true,
    array(
      select distinct d
      from (
        select left(dates.raw_date, 10) as d
        from jsonb_array_elements_text(coalesce(h.completed_dates, '[]'::jsonb)) as dates(raw_date)
        union all
        -- Treat the posted memory date as completed even if local habit sync has not pushed yet.
        select p_date_str as d
      ) s
      where d ~ '^\d{4}-\d{2}-\d{2}$'
      order by d
    )
  into v_habit_exists, v_dates
  from public.habits h
  where h.user_id = p_user_id
    and h.id = p_habit_id;

  if not coalesce(v_habit_exists, false) then
    return null;
  end if;

  v_cursor := p_date_str::date;
  loop
    exit when not (to_char(v_cursor, 'YYYY-MM-DD') = any(v_dates));
    v_count := v_count + 1;
    v_cursor := v_cursor - 1;
  end loop;

  return greatest(v_count, 1);
end;
$$;

revoke all on function public._community_habit_win_streak_count(uuid, text, text) from public;

create or replace function public._community_correct_habit_streak_win()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_habit_id text;
  v_date_str text;
  v_count integer;
begin
  if coalesce(new.feed_source, 'mini') <> 'habit_streak'
    or split_part(coalesce(new.mini_mission_id, ''), ':', 1) <> 'habitwin'
  then
    return new;
  end if;

  v_habit_id := split_part(new.mini_mission_id, ':', 2);
  v_date_str := split_part(new.mini_mission_id, ':', 3);
  v_count := public._community_habit_win_streak_count(new.user_id, v_habit_id, v_date_str);

  if v_count is not null then
    new.streak_count_at_post := v_count;
  end if;

  return new;
end;
$$;

revoke all on function public._community_correct_habit_streak_win() from public;

drop trigger if exists trg_community_correct_habit_streak_win on public.community_wins;
create trigger trg_community_correct_habit_streak_win
  before insert or update of user_id, mini_mission_id, feed_source on public.community_wins
  for each row
  execute function public._community_correct_habit_streak_win();

create or replace function public._community_refresh_habit_streak_wins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.completed_dates is not distinct from new.completed_dates then
    return new;
  end if;

  update public.community_wins cw
  set streak_count_at_post = public._community_habit_win_streak_count(
    new.user_id,
    new.id,
    split_part(cw.mini_mission_id, ':', 3)
  )
  where cw.user_id = new.user_id
    and coalesce(cw.feed_source, 'mini') = 'habit_streak'
    and split_part(cw.mini_mission_id, ':', 1) = 'habitwin'
    and split_part(cw.mini_mission_id, ':', 2) = new.id
    and split_part(cw.mini_mission_id, ':', 3) ~ '^\d{4}-\d{2}-\d{2}$'
    and public._community_habit_win_streak_count(
      new.user_id,
      new.id,
      split_part(cw.mini_mission_id, ':', 3)
    ) is not null;

  return new;
end;
$$;

revoke all on function public._community_refresh_habit_streak_wins() from public;

drop trigger if exists trg_community_refresh_habit_streak_wins on public.habits;
create trigger trg_community_refresh_habit_streak_wins
  after insert or update of completed_dates on public.habits
  for each row
  execute function public._community_refresh_habit_streak_wins();

-- Backfill existing habit-streak wins so old stale rows are corrected too.
with corrected as (
  select
    cw.id,
    public._community_habit_win_streak_count(
      cw.user_id,
      split_part(cw.mini_mission_id, ':', 2),
      split_part(cw.mini_mission_id, ':', 3)
    ) as streak_count
  from public.community_wins cw
  where coalesce(cw.feed_source, 'mini') = 'habit_streak'
    and split_part(cw.mini_mission_id, ':', 1) = 'habitwin'
    and split_part(cw.mini_mission_id, ':', 3) ~ '^\d{4}-\d{2}-\d{2}$'
)
update public.community_wins cw
set streak_count_at_post = corrected.streak_count
from corrected
where cw.id = corrected.id
  and corrected.streak_count is not null;
