-- Adds avatarUrl to the shared _hp_profile_label_json(uuid) helper, so every
-- RPC that already builds an "author"/profile-label payload through it
-- (community feed, challenge streak members, memory detail, etc.) picks up
-- the new profiles.avatar_url column automatically, with no per-RPC change.

create or replace function public._hp_profile_label_json(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'userId', p.id,
        'username', nullif(lower(coalesce(p.username::text, '')), ''),
        'displayName', nullif(trim(coalesce(p.display_name, '')), ''),
        'xp', coalesce(p.xp, 0),
        'avatarUrl', p.avatar_url
      )
      from public.profiles p
      where p.id = p_user_id
    ),
    jsonb_build_object('userId', p_user_id, 'username', null, 'displayName', null, 'xp', 0, 'avatarUrl', null)
  );
$$;

revoke all on function public._hp_profile_label_json(uuid) from public;
