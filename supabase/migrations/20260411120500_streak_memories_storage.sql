-- Public read for streak moment images (URLs are unlisted; paths include user id + random segments).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'streak-memories',
  'streak-memories',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Upload only into own first path segment: {auth.uid()}/...
create policy "streak_memories_insert_own_prefix"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'streak-memories'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "streak_memories_update_own_prefix"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'streak-memories'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'streak-memories'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "streak_memories_delete_own_prefix"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'streak-memories'
    and split_part(name, '/', 1) = auth.uid()::text
  );
