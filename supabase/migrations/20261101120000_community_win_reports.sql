-- Report a Community post.
--
-- Anyone signed in can report someone else's post once, with a reason
-- (copyright among them). Once the 'community_report_autohide' flag is on,
-- three different reporters hide the post for everyone but its author until
-- it is reviewed. With the flag off (the default) reports are only recorded,
-- so pushing this changes nothing anyone sees. Reports and hides live in
-- their own tables, so a post's author (who can update their own
-- community_wins row) can't clear a hide.
--
-- Backward compatible: older app versions never call the new RPC; they only
-- stop seeing hidden posts, through the same feed RPC and select policy they
-- already use. Review queue: select from community_win_reports in the
-- dashboard; un-hide = delete the community_win_moderation row.

create table if not exists public.app_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  starts_on date,
  updated_at timestamptz not null default now()
);
alter table public.app_feature_flags enable row level security;
insert into public.app_feature_flags (key, enabled) values ('community_report_autohide', false)
on conflict (key) do nothing;

create table if not exists public.community_win_reports (
  id uuid primary key default gen_random_uuid(),
  win_id uuid not null references public.community_wins (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('copyright', 'inappropriate', 'spam', 'harassment', 'other')),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now(),
  unique (win_id, reporter_id)
);

create index if not exists community_win_reports_reporter_idx
  on public.community_win_reports (reporter_id, created_at desc);

-- No policies: written only by rpc_report_community_win_v1, read from the dashboard.
alter table public.community_win_reports enable row level security;

create table if not exists public.community_win_moderation (
  win_id uuid primary key references public.community_wins (id) on delete cascade,
  reason text not null default 'reports',
  hidden_at timestamptz not null default now()
);

alter table public.community_win_moderation enable row level security;

-- Readable so the community_wins select policy below can see it; it only
-- holds ids of hidden posts.
drop policy if exists "community_win_moderation_select_all" on public.community_win_moderation;
create policy "community_win_moderation_select_all"
  on public.community_win_moderation for select
  to authenticated
  using (true);

-- Hidden posts disappear for everyone except their author.
drop policy if exists "community_wins_select_authenticated" on public.community_wins;
create policy "community_wins_select_authenticated"
  on public.community_wins for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or not exists (select 1 from public.community_win_moderation m where m.win_id = community_wins.id)
  );

create or replace function public.rpc_report_community_win_v1(
  p_win_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_owner uuid;
  v_recent integer;
  v_reporters integer;
  v_hidden boolean := false;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_reason is null or p_reason not in ('copyright', 'inappropriate', 'spam', 'harassment', 'other') then
    raise exception 'invalid_reason';
  end if;

  select w.user_id into v_owner from public.community_wins w where w.id = p_win_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_owner = uid then
    raise exception 'own_post';
  end if;

  select count(*) into v_recent
  from public.community_win_reports r
  where r.reporter_id = uid and r.created_at > now() - interval '1 day';
  if v_recent >= 20 then
    raise exception 'rate_limited';
  end if;

  insert into public.community_win_reports (win_id, reporter_id, reason, details)
  values (p_win_id, uid, p_reason, nullif(left(btrim(coalesce(p_details, '')), 500), ''))
  on conflict (win_id, reporter_id) do nothing;

  select count(*) into v_reporters from public.community_win_reports r where r.win_id = p_win_id;
  if v_reporters >= 3
     and coalesce((select f.enabled from public.app_feature_flags f where f.key = 'community_report_autohide'), false) then
    insert into public.community_win_moderation (win_id) values (p_win_id) on conflict (win_id) do nothing;
    v_hidden := true;
  end if;

  return jsonb_build_object('reported', true, 'hidden', v_hidden);
end;
$$;

revoke all on function public.rpc_report_community_win_v1(uuid, text, text) from public, anon;
grant execute on function public.rpc_report_community_win_v1(uuid, text, text) to authenticated;

-- Same feed RPC as 20261026120000_community_comment_threads_unread.sql, plus
-- two filters in both cursor queries: hidden posts are skipped except for
-- their author, and a reporter no longer gets the posts they reported.
-- Signature and payload are unchanged.
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
    and (w.user_id = uid or not exists (select 1 from public.community_win_moderation m where m.win_id = w.id))
    and not exists (select 1 from public.community_win_reports r where r.win_id = w.id and r.reporter_id = uid)
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
    and (w.user_id = uid or not exists (select 1 from public.community_win_moderation m where m.win_id = w.id))
    and not exists (select 1 from public.community_win_reports r where r.win_id = w.id and r.reporter_id = uid)
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

