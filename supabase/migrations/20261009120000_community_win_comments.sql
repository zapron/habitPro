-- POC: comments on Community wins. Mirrors community_win_cheers exactly —
-- direct table ops + granular per-action RLS, no RPC — rather than the
-- abandoned challenge_memory_comments pattern (a single FOR ALL policy
-- whose WITH CHECK never actually constrains DELETE, since WITH CHECK only
-- applies to INSERT/UPDATE). Delete is intentionally two-tier: the comment's
-- own author, OR the win's owner moderating their own post.

create table if not exists public.community_win_comments (
  id uuid primary key default gen_random_uuid(),
  win_id uuid not null references public.community_wins (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists community_win_comments_win_id_idx
  on public.community_win_comments (win_id, created_at);

create index if not exists community_win_comments_author_id_idx
  on public.community_win_comments (author_id);

alter table public.community_win_comments enable row level security;

create policy "community_win_comments_select_authenticated"
  on public.community_win_comments for select
  to authenticated
  using (true);

create policy "community_win_comments_insert_own"
  on public.community_win_comments for insert
  to authenticated
  with check (auth.uid() = author_id);

-- Two-tier delete: the commenter themselves, or the post owner moderating
-- their own win. Explicit OR, not a blanket "any member" check — the exact
-- gap the old challenge_memory_comments policy had.
create policy "community_win_comments_delete_own_or_post_owner"
  on public.community_win_comments for delete
  to authenticated
  using (
    auth.uid() = author_id
    or auth.uid() = (select w.user_id from public.community_wins w where w.id = community_win_comments.win_id)
  );

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

drop trigger if exists trg_community_win_comment_notify on public.community_win_comments;

create trigger trg_community_win_comment_notify
  after insert on public.community_win_comments
  for each row execute procedure public.notify_community_win_comment();
