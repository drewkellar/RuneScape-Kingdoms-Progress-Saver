-- Apply after 003: confirmed two-token XP progression, including legacy saves.
create function public.normalize_progression(s jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare k text; lv integer; xp integer;
begin
 if s->>'autoLevel' = 'false' then
  foreach k in array array['attack','ranged','magic','defence','thieving','gathering','crafting','cooking'] loop
   xp := (s->'skills'->k->>'xp')::integer;
   lv := least(99, (s->'skills'->k->>'level')::integer + xp / 3);
   s := jsonb_set(s,array['skills',k],jsonb_build_object('level',lv,'xp',case when lv=99 then 0 else xp%3 end));
  end loop;
  s := jsonb_set(s,array['autoLevel'],'true'::jsonb);
 end if;
 return s;
end $$;
revoke execute on function public.normalize_progression(jsonb) from public,anon,authenticated;

create or replace function public.create_character(p_id uuid,p_group uuid,p_state jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from groups where id=p_group for update;
 if not is_member(p_group) then raise exception 'Access denied'; end if;
 perform validate_state(p_state,p_group);
 insert into characters(id,owner_id,group_id,state) values(p_id,auth.uid(),p_group,normalize_progression(p_state));
end $$;

create or replace function public.apply_action(p_id uuid,p_character uuid,p_expected integer,p_operation jsonb,p_label text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare c characters; s jsonb; kind text:=p_operation->>'kind'; k text:=p_operation->>'key'; delta integer; n integer; lv integer; existing actions; g uuid;
begin
 select group_id into g from characters where id=p_character;
 perform 1 from groups where id=g for update;
 if not can_edit_character(p_character) then raise exception 'Access denied'; end if;
 select * into c from characters where id=p_character for update;
 select * into existing from actions where id=p_id;
 if found then
  if existing.character_id<>p_character or existing.actor_id<>auth.uid() then raise exception 'Action ID conflict'; end if;
  return existing.revision;
 end if;
 if length(p_label) not between 1 and 200 then raise exception 'Invalid label'; end if;
 if kind not in ('resource','xp') and p_expected<>c.revision then raise exception 'Revision conflict: this sheet has newer changes'; end if;
 s:=normalize_progression(c.state);
 if kind in ('resource','xp') then
  if jsonb_typeof(p_operation->'delta') is distinct from 'number' or (p_operation->>'delta')::numeric<>trunc((p_operation->>'delta')::numeric) or abs((p_operation->>'delta')::numeric)>999999 then raise exception 'Invalid adjustment'; end if;
  delta:=(p_operation->>'delta')::int;
  if kind='resource' then
   if k is null or k !~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$' then raise exception 'Invalid resource'; end if;
   n:=coalesce((s->'resources'->>k)::int,0)+delta;
   s:=jsonb_set(s,array['resources',k],to_jsonb(n));
  else
   if k is null or not(s->'skills' ? k) then raise exception 'Invalid skill'; end if;
   n:=(s->'skills'->k->>'xp')::int+delta; lv:=(s->'skills'->k->>'level')::int;
   if n<0 then raise exception 'XP cannot be negative'; end if;
   if (s->>'autoLevel')::boolean then lv:=least(99,lv+n/3); n:=case when lv=99 then 0 else n%3 end; end if;
   s:=jsonb_set(s,array['skills',k],jsonb_build_object('level',lv,'xp',n));
  end if;
 elsif kind='replace' then s:=p_operation->'state';
 elsif kind='undo' then
  select before_state into s from actions where id=(p_operation->>'actionId')::uuid and character_id=c.id and revision=c.revision;
  if not found then raise exception 'Undo unavailable: newer changes exist'; end if;
 elsif kind='restore' then
  select state into s from checkpoints where id=(p_operation->>'checkpointId')::uuid and character_id=c.id;
  if not found then raise exception 'Checkpoint unavailable'; end if;
 else raise exception 'Invalid operation'; end if;
 s:=normalize_progression(s);
 perform validate_state(s,c.group_id);
 if kind in ('replace','restore') then insert into checkpoints(character_id,group_id,kind,state,revision) values(c.id,c.group_id,'recovery',c.state,c.revision); end if;
 update characters set state=s,revision=revision+1,updated_at=now() where id=c.id;
 insert into actions values(p_id,c.id,auth.uid(),actor_name(),p_label,c.state,s,c.revision+1,now());
 if not exists(select 1 from checkpoints cp where cp.character_id=c.id and cp.kind='automatic' and cp.created_at>now()-interval '10 minutes') then
  insert into checkpoints(character_id,group_id,kind,state,revision) values(c.id,c.group_id,'automatic',s,c.revision+1);
  delete from checkpoints where id in(select cp.id from checkpoints cp where cp.character_id=c.id and cp.kind='automatic' order by cp.created_at desc,cp.id desc offset 100);
 end if;
 return c.revision+1;
end $$;
