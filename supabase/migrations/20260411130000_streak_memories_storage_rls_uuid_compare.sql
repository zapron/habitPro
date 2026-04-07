-- Fix streak-memories storage RLS: text compare of UUID path segment vs auth.uid()::text
-- can fail when casing differs (JS may send uppercase UUID segments). Use uuid equality.

drop policy if exists "streak_memories_insert_own_prefix" on storage.objects;
drop policy if exists "streak_memories_update_own_prefix" on storage.objects;
drop policy if exists "streak_memories_delete_own_prefix" on storage.objects;

create policy "streak_memories_insert_own_prefix"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'streak-memories'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

create policy "streak_memories_update_own_prefix"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'streak-memories'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  )
  with check (
    bucket_id = 'streak-memories'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

create policy "streak_memories_delete_own_prefix"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'streak-memories'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

-- Public read for public bucket (anonymous clients loading image URLs)
drop policy if exists "streak_memories_select_public" on storage.objects;
create policy "streak_memories_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'streak-memories');
