insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portraits','portraits',false,1048576,array['image/webp']) on conflict(id) do nothing;
create policy portraits_read on storage.objects for select to authenticated using(bucket_id='portraits' and public.can_read_character((storage.foldername(name))[1]::uuid));
create policy portraits_insert on storage.objects for insert to authenticated with check(bucket_id='portraits' and public.can_edit_character((storage.foldername(name))[1]::uuid));
create policy portraits_delete on storage.objects for delete to authenticated using(bucket_id='portraits' and public.can_edit_character((storage.foldername(name))[1]::uuid));

-- Only group members can subscribe or publish presence. No character data is broadcast.
create policy group_presence_read on realtime.messages for select to authenticated using(extension='presence' and exists(select 1 from public.groups g where 'group:'||g.id::text=realtime.topic() and public.is_member(g.id)));
create policy group_presence_write on realtime.messages for insert to authenticated with check(extension='presence' and exists(select 1 from public.groups g where 'group:'||g.id::text=realtime.topic() and public.is_member(g.id)));
alter publication supabase_realtime add table public.characters,public.card_definitions;
