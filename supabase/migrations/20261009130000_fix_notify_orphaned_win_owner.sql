-- Fix: both community-win notify triggers insert into `notifications` keyed
-- by the win's owner user_id, but never checked that owner actually exists
-- in auth.users before inserting. A win whose owner has no local auth.users
-- row (e.g. profiles/wins carried over from a production data snapshot into
-- a local dev database) makes the insert violate notifications_user_id_fkey,
-- which — since this fires from an AFTER INSERT trigger in the same
-- transaction — rolls back the whole comment/cheer insert too. This was
-- real: hit live commenting on a snapshot-origin post locally, and the
-- cheer trigger has had the identical latent bug since it shipped (just
-- never exercised cheering on an orphaned-owner post before).
--
-- Fix is the same shape in both: skip the notification (not the
-- comment/cheer itself) when the recipient doesn't exist.

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

  -- No notification when cheering your own win (should be rare / disallowed in UI).
  if new.user_id = win_owner then
    return new;
  end if;

  -- Recipient must actually exist locally (not an orphaned snapshot-origin
  -- owner) or the notifications insert below violates its FK on user_id.
  if not exists (select 1 from auth.users u where u.id = win_owner) then
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

create or replace function public.notify_community_win_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  win_owner uuid;
  win_title text;
  commenter_name text;
begin
  select cw.user_id, cw.title
  into win_owner, win_title
  from public.community_wins cw
  where cw.id = new.win_id;

  if win_owner is null then
    return new;
  end if;

  -- No notification when commenting on your own win.
  if new.author_id = win_owner then
    return new;
  end if;

  -- Recipient must actually exist locally (not an orphaned snapshot-origin
  -- owner) or the notifications insert below violates its FK on user_id.
  if not exists (select 1 from auth.users u where u.id = win_owner) then
    return new;
  end if;

  select coalesce(nullif(trim(p.username::text), ''), null)
  into commenter_name
  from public.profiles p
  where p.id = new.author_id;

  insert into public.notifications (user_id, type, payload)
  values (
    win_owner,
    'community_win_comment',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'community_win_comment',
      'win_id', new.win_id,
      'comment_id', new.id,
      'from_user_id', new.author_id,
      'from_username', coalesce(commenter_name, 'someone'),
      'mini_mission_title', coalesce(win_title, 'Mini mission'),
      'body', new.body,
      'created_at', new.created_at
    )
  );

  return new;
end;
$$;
