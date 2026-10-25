-- Comment threads: "N new" on threads you're part of, plus a notification to
-- everyone already in a thread when someone else replies.
--
-- * community_win_comment_reads: one row per (user, win) = "I've seen this
--   thread up to last_read_at". Written by commenting (trigger) and by opening
--   the comments sheet as a participant (rpc_mark_community_win_comments_read_v1).
--   Having a row is also what makes you a participant for the feed's pill.
-- * rpc_community_feed_page_v1 gains unreadCommentCount, computed in the same
--   query the feed already runs (like viewerHasCheered); no extra round trip.
-- * notify_community_win_comment also notifies earlier commenters with
--   community_win_thread_reply. One unread notification per thread per user:
--   further replies update it (count + latest preview) instead of inserting,
--   so push (an INSERT webhook) fires once per unread thread, not per comment.

create table if not exists public.community_win_comment_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  win_id uuid not null references public.community_wins (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, win_id)
);

create index if not exists community_win_comment_reads_win_id_idx
  on public.community_win_comment_reads (win_id);

alter table public.community_win_comment_reads enable row level security;

-- Read your own rows only; all writes go through the trigger / RPC below.
create policy "community_win_comment_reads_select_own"
  on public.community_win_comment_reads for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Backfill: everyone already in a thread starts "caught up", so the first
-- launch doesn't light up every old conversation at once.
insert into public.community_win_comment_reads (user_id, win_id, last_read_at)
select distinct c.author_id, c.win_id, now()
from public.community_win_comments c
join auth.users u on u.id = c.author_id
on conflict (user_id, win_id) do nothing;

insert into public.community_win_comment_reads (user_id, win_id, last_read_at)
select w.user_id, w.id, now()
from public.community_wins w
join auth.users u on u.id = w.user_id
where w.comment_count > 0
on conflict (user_id, win_id) do nothing;

-- Writing a comment means you've seen the thread up to it.
create or replace function public.tg_community_win_comments_mark_author_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_win_comment_reads (user_id, win_id, last_read_at)
  values (new.author_id, new.win_id, new.created_at)
  on conflict (user_id, win_id) do update
    set last_read_at = greatest(community_win_comment_reads.last_read_at, excluded.last_read_at);
  return new;
end;
$$;

drop trigger if exists trg_community_win_comments_mark_author_read on public.community_win_comments;
create trigger trg_community_win_comments_mark_author_read
  after insert on public.community_win_comments
  for each row execute function public.tg_community_win_comments_mark_author_read();

-- Called when the comments sheet opens. Returns the previous last_read_at so
-- the sheet can draw its "N new since you last looked" divider, then marks
-- the thread read and clears its unread thread-reply notification.
-- Non-participants get null and nothing is written (just reading a thread
-- doesn't sign you up for its pill).
create or replace function public.rpc_mark_community_win_comments_read_v1(p_win_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_owner uuid;
  v_win_created timestamptz;
  v_prev timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select w.user_id, w.created_at into v_owner, v_win_created
  from public.community_wins w
  where w.id = p_win_id;
  if not found then
    return null;
  end if;

  select r.last_read_at into v_prev
  from public.community_win_comment_reads r
  where r.user_id = uid and r.win_id = p_win_id;

  if v_prev is null and v_owner is distinct from uid then
    return null;
  end if;
  v_prev := coalesce(v_prev, v_win_created);

  insert into public.community_win_comment_reads (user_id, win_id, last_read_at)
  values (uid, p_win_id, now())
  on conflict (user_id, win_id) do update set last_read_at = now();

  update public.notifications n
     set read_at = now()
   where n.user_id = uid
     and n.type = 'community_win_thread_reply'
     and n.read_at is null
     and n.payload->>'win_id' = p_win_id::text;

  return v_prev;
end;
$$;

revoke all on function public.rpc_mark_community_win_comments_read_v1(uuid) from public;
grant execute on function public.rpc_mark_community_win_comments_read_v1(uuid) to authenticated;

-- Owner notification unchanged (same guards as 20261009130000), plus the
-- thread fan-out to earlier commenters.
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
  v_recipient uuid;
begin
  select cw.user_id, cw.title
  into win_owner, win_title
  from public.community_wins cw
  where cw.id = new.win_id;

  if win_owner is null then
    return new;
  end if;

  select coalesce(nullif(trim(p.username::text), ''), null)
  into commenter_name
  from public.profiles p
  where p.id = new.author_id;

  -- Post owner (not when commenting on your own win; recipient must exist
  -- locally or the FK on notifications.user_id fails the whole insert).
  if new.author_id <> win_owner
     and exists (select 1 from auth.users u where u.id = win_owner) then
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
  end if;

  -- Everyone else who has commented here (still has a comment, so a deleted
  -- comment drops you out), except the new comment's author and the owner.
  for v_recipient in
    select distinct c.author_id
    from public.community_win_comments c
    join auth.users u on u.id = c.author_id
    where c.win_id = new.win_id
      and c.id <> new.id
      and c.author_id <> new.author_id
      and c.author_id <> win_owner
  loop
    update public.notifications n
       set payload = n.payload || jsonb_build_object(
             'comment_id', new.id,
             'from_user_id', new.author_id,
             'from_username', coalesce(commenter_name, 'someone'),
             'body', new.body,
             'reply_count', coalesce((n.payload->>'reply_count')::int, 1) + 1,
             'created_at', new.created_at
           ),
           created_at = now()
     where n.user_id = v_recipient
       and n.type = 'community_win_thread_reply'
       and n.read_at is null
       and n.payload->>'win_id' = new.win_id::text;

    if not found then
      insert into public.notifications (user_id, type, payload)
      values (
        v_recipient,
        'community_win_thread_reply',
        jsonb_build_object(
          'schema', 'habitpro.notification.v1',
          'kind', 'community_win_thread_reply',
          'win_id', new.win_id,
          'comment_id', new.id,
          'from_user_id', new.author_id,
          'from_username', coalesce(commenter_name, 'someone'),
          'mini_mission_title', coalesce(win_title, 'Mini mission'),
          'body', new.body,
          'reply_count', 1,
          'created_at', new.created_at
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

-- Feed RPC: identical to 20261012090000 plus unreadCommentCount.
create or replace function public.rpc_community_feed_page_v1(
  p_cursor_created_at timestamp with time zone default null::timestamp with time zone,
  p_cursor_id uuid default null::uuid,
  p_limit integer default 15
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 15), 1), 40);
  v_items jsonb := '[]'::jsonb;
  v_next_cursor jsonb := null;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  with raw as (
    select w.*
    from public.community_wins w
    where (
      p_cursor_created_at is null
      or (w.created_at, w.id) < (p_cursor_created_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
    order by w.created_at desc, w.id desc
    limit v_limit + 1
  ),
  page_rows as (
    select *
    from raw
    order by created_at desc, id desc
    limit v_limit
  ),
  shaped as (
    select
      w.created_at,
      w.id,
      jsonb_build_object(
        -- strip both denormalized columns from the win payload so `win` stays
        -- byte-identical to the pre-migration shape (counts are exposed as
        -- cheerCount / commentCount instead)
        'win', to_jsonb(w) - 'cheer_count' - 'comment_count',
        'author', public._hp_profile_label_json(w.user_id),
        'cheerCount', coalesce(w.cheer_count, 0),
        'commentCount', coalesce(w.comment_count, 0),
        -- Comments by others since the viewer last opened this thread (capped at
        -- 10; the client shows 9+). Only for threads the viewer is part of: a
        -- read row exists (they commented / opened it as a participant), or it
        -- is their own post (falls back to the post's creation time).
        'unreadCommentCount', case
          when coalesce(w.comment_count, 0) = 0 then 0
          else (
            select count(*)::int
            from (
              select 1
              from public.community_win_comments c
              where c.win_id = w.id
                and c.author_id <> uid
                and c.created_at > coalesce(
                  (select r.last_read_at
                     from public.community_win_comment_reads r
                    where r.user_id = uid and r.win_id = w.id),
                  case when w.user_id = uid then w.created_at end
                )
              limit 10
            ) unread
          )
        end,
        'viewerHasCheered', exists (
          select 1
          from public.community_win_cheers mine
          where mine.win_id = w.id
            and mine.user_id = uid
        ),
        'image', jsonb_build_object(
          'thumbUrl', w.memory_image_url,
          'fullUrl', w.memory_image_url,
          'width', null,
          'height', null,
          'blurhash', null
        )
      ) as item
    from page_rows w
  )
  select coalesce(jsonb_agg(item order by created_at desc, id desc), '[]'::jsonb)
    into v_items
  from shaped;

  select jsonb_build_object('createdAt', r.created_at, 'id', r.id)
    into v_next_cursor
  from (
    select *
    from public.community_wins w
    where (
      p_cursor_created_at is null
      or (w.created_at, w.id) < (p_cursor_created_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
    order by w.created_at desc, w.id desc
    offset v_limit
    limit 1
  ) r;

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', v_next_cursor,
    'serverNow', now()
  );
end;
$function$;
