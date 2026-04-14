-- Premium flag + one-time custom squad note (kind = custom_note) per sender/recipient/challenge.

alter table public.profiles
  add column if not exists is_premium boolean not null default false;

comment on column public.profiles.is_premium is 'Set by billing / admin; gates premium squad features (e.g. custom nudge).';

alter table public.challenge_nudges
  add column if not exists message text null;

comment on column public.challenge_nudges.message is 'User text for kind custom_note; null for preset nudges.';

-- Drop daily rate-limit index so we can replace with a partial that excludes custom_note.
drop index if exists public.challenge_nudges_one_per_day_idx;

create unique index challenge_nudges_one_per_day_idx
  on public.challenge_nudges (
    challenge_id,
    from_user_id,
    to_user_id,
    kind,
    ((created_at at time zone 'utc')::date)
  )
  where kind is distinct from 'custom_note';

-- At most one custom note ever per (challenge, sender, recipient).
create unique index if not exists challenge_nudges_custom_note_once_idx
  on public.challenge_nudges (challenge_id, from_user_id, to_user_id)
  where kind = 'custom_note';

alter table public.challenge_nudges drop constraint if exists challenge_nudges_kind_check;

alter table public.challenge_nudges
  add constraint challenge_nudges_kind_check
  check (kind in ('cheer', 'ping', 'fire', 'congrats', 'custom_note'));

alter table public.challenge_nudges drop constraint if exists challenge_nudges_message_matches_kind;

alter table public.challenge_nudges
  add constraint challenge_nudges_message_matches_kind
  check (
    (kind = 'custom_note' and message is not null and length(trim(message)) between 1 and 200)
    or (kind <> 'custom_note' and message is null)
  );

-- Clients cannot insert custom_note directly (must use RPC for premium check + notification).
drop policy if exists "challenge_nudges_insert_sender_member" on public.challenge_nudges;

create policy "challenge_nudges_insert_sender_member"
  on public.challenge_nudges for insert
  with check (
    auth.uid() = from_user_id
    and public.user_is_challenge_member(challenge_id, auth.uid())
    and public.user_is_challenge_member(challenge_id, to_user_id)
    and kind is distinct from 'custom_note'
  );

create or replace function public.rpc_send_challenge_custom_nudge(
  p_challenge_id uuid,
  p_to_user_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_from_username text;
  v_trim text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if uid = p_to_user_id then
    raise exception 'cannot nudge yourself';
  end if;
  if not coalesce((select p.is_premium from public.profiles p where p.id = uid), false) then
    raise exception 'premium_required';
  end if;
  if not public.user_is_challenge_member(p_challenge_id, uid) then
    raise exception 'not a member';
  end if;
  if not public.user_is_challenge_member(p_challenge_id, p_to_user_id) then
    raise exception 'recipient not a member';
  end if;

  v_trim := trim(both from coalesce(p_message, ''));
  if length(v_trim) < 1 or length(v_trim) > 200 then
    raise exception 'invalid_message_length';
  end if;

  begin
    insert into public.challenge_nudges (challenge_id, from_user_id, to_user_id, kind, message)
    values (p_challenge_id, uid, p_to_user_id, 'custom_note', v_trim)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'custom_note_already_sent';
  end;

  select nullif(trim(lower(username::text)), '') into v_from_username
  from public.profiles
  where id = uid;

  perform public.rpc_insert_notification(
    p_to_user_id,
    'challenge_nudge',
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'nudge_id', v_id,
      'from_user_id', uid,
      'from_username', v_from_username,
      'kind', 'custom_note',
      'message', v_trim
    )
  );
end;
$$;

revoke all on function public.rpc_send_challenge_custom_nudge(uuid, uuid, text) from public;
grant execute on function public.rpc_send_challenge_custom_nudge(uuid, uuid, text) to authenticated;
