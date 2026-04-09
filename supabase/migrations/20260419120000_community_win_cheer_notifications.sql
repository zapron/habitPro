-- Notify win owner when someone cheers their community win (in-app inbox now; same payload shape can feed push later).

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
begin
  select cw.user_id, cw.title
  into win_owner, win_title
  from public.community_wins cw
  where cw.id = new.win_id;

  if win_owner is null then
    return new;
  end if;

  -- No notification when cheering your own win (should be rare / disallowed in UI)
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
      'created_at', new.created_at
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_community_win_cheer_notify on public.community_win_cheers;

create trigger trg_community_win_cheer_notify
  after insert on public.community_win_cheers
  for each row execute procedure public.notify_community_win_cheer();
