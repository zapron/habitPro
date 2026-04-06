-- Invite by account email: prefix search over auth.users (SECURITY DEFINER bypasses auth RLS).
create or replace function public.search_users_by_email_prefix(p_prefix text, p_limit int default 20)
returns table (id uuid, email text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text, p.display_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.email is not null
    and length(trim(p_prefix)) >= 3
    and lower(u.email) like lower(trim(p_prefix)) || '%'
  order by u.email asc
  limit least(coalesce(p_limit, 20), 50);
$$;

revoke all on function public.search_users_by_email_prefix(text, int) from public;
grant execute on function public.search_users_by_email_prefix(text, int) to authenticated;
