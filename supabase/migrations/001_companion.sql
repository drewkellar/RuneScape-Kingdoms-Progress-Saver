-- Apply to a new Supabase project using the SQL editor or `supabase db push`.
create table public.groups (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80), host_id uuid not null references auth.users);
create table public.memberships (group_id uuid references public.groups on delete cascade, user_id uuid references auth.users, display_name text not null, primary key(group_id,user_id));
create table public.campaigns (id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups, name text not null check(length(name) between 1 and 100), status text not null default 'active' check(status in ('active','archived')));
create table public.characters (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users, group_id uuid not null references public.groups, campaign_id uuid references public.campaigns, state jsonb not null, revision integer not null default 0, portrait_path text, updated_at timestamptz not null default now());
create index on public.characters(group_id);
create table public.card_definitions (id uuid primary key, group_id uuid not null references public.groups, revision integer not null default 1, name text not null check(length(name) between 1 and 100), kind text not null check(kind in ('weapon','armour','accessory','cape','recipe','quest','other')), effects text not null check(length(effects)<=10000), requirements text not null check(length(requirements)<=4000));
create table public.actions (id uuid primary key, character_id uuid not null references public.characters, actor_id uuid not null references auth.users, actor_name text not null, label text not null, before_state jsonb not null, after_state jsonb not null, revision integer not null, created_at timestamptz not null default now(), unique(character_id,revision));
create index on public.actions(character_id,revision desc);
create table public.checkpoints (id uuid primary key default gen_random_uuid(), character_id uuid not null references public.characters, group_id uuid not null references public.groups, session_id uuid, kind text not null check(kind in ('automatic','session','recovery')), state jsonb not null, revision integer not null, created_at timestamptz not null default now());
create index on public.checkpoints(character_id,created_at desc);
create table public.invitations (id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups, token uuid not null unique default gen_random_uuid(), expires_at timestamptz not null default now()+interval '7 days', revoked boolean not null default false);

create function public.is_member(g uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from memberships where group_id=g and user_id=auth.uid()) $$;
create function public.is_host(g uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from groups where id=g and host_id=auth.uid()) $$;
create function public.can_read_character(c uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from characters where id=c and (owner_id=auth.uid() or is_member(group_id))) $$;
create function public.can_edit_character(c uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from characters where id=c and (owner_id=auth.uid() or is_host(group_id))) $$;
create function public.actor_name() returns text language sql stable set search_path=public,pg_temp as $$ select left(coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->'user_metadata'->>'name','Adventurer'),80) $$;

alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.campaigns enable row level security;
alter table public.characters enable row level security;
alter table public.card_definitions enable row level security;
alter table public.actions enable row level security;
alter table public.checkpoints enable row level security;
alter table public.invitations enable row level security;
create policy groups_read on public.groups for select to authenticated using(is_member(id));
create policy members_read on public.memberships for select to authenticated using(is_member(group_id));
create policy campaigns_read on public.campaigns for select to authenticated using(is_member(group_id));
create policy characters_read on public.characters for select to authenticated using(owner_id=auth.uid() or is_member(group_id));
create policy cards_read on public.card_definitions for select to authenticated using(is_member(group_id));
create policy actions_read on public.actions for select to authenticated using(can_read_character(character_id));
create policy checkpoints_read on public.checkpoints for select to authenticated using(can_read_character(character_id));
create policy invitations_read on public.invitations for select to authenticated using(is_host(group_id));
revoke all on public.groups,public.memberships,public.campaigns,public.characters,public.card_definitions,public.actions,public.checkpoints,public.invitations from anon,authenticated;
grant select on public.groups,public.memberships,public.campaigns,public.characters,public.card_definitions,public.actions,public.checkpoints to authenticated;

create function public.validate_state(s jsonb, g uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare k text; v jsonb; n numeric; sk text; keys text[] := array['attack','ranged','magic','defence','thieving','gathering','crafting','cooking'];
begin
 if jsonb_typeof(s) is distinct from 'object' or (select count(*) from jsonb_object_keys(s))<>12
 or not(s ?& array['name','notes','skills','resources','wounds','deaths','sideQuests','hitpoints','capeNotes','cards','autoLevel','ruleset']) then raise exception 'Invalid character fields'; end if;
 if jsonb_typeof(s->'name') is distinct from 'string' or length(trim(s->>'name')) not between 1 and 80 or jsonb_typeof(s->'notes') is distinct from 'string' or length(s->>'notes')>10000 or jsonb_typeof(s->'capeNotes') is distinct from 'string' or length(s->>'capeNotes')>4000 or s->>'ruleset' is distinct from 'elvarg-provisional-v1' or jsonb_typeof(s->'autoLevel') is distinct from 'boolean' then raise exception 'Invalid character text'; end if;
 if jsonb_typeof(s->'skills') is distinct from 'object' or not(s->'skills' ?& keys) or (select count(*) from jsonb_object_keys(s->'skills'))<>8 then raise exception 'Invalid skills'; end if;
 foreach sk in array keys loop
  v:=s->'skills'->sk;
  if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['level','xp']) or (select count(*) from jsonb_object_keys(v))<>2 then raise exception 'Invalid skill'; end if;
  foreach k in array array['level','xp'] loop
   if jsonb_typeof(v->k) is distinct from 'number' then raise exception 'Invalid skill value'; end if;
   n:=(v->>k)::numeric;
   if n<>trunc(n) or n<0 or n>999999 or (k='level' and (n<1 or n>99)) then raise exception 'Invalid skill value'; end if;
  end loop;
  if (s->>'autoLevel')::boolean and ((v->>'xp')::int>2 or ((v->>'level')::int=99 and (v->>'xp')::int<>0)) then raise exception 'Invalid automatic XP state'; end if;
 end loop;
 foreach k in array array['wounds','deaths','sideQuests','hitpoints'] loop
  if jsonb_typeof(s->k) is distinct from 'number' then raise exception 'Invalid counter'; end if;
  n:=(s->>k)::numeric; if n<>trunc(n) or n<0 or n>999999 then raise exception 'Invalid counter'; end if;
 end loop;
 if jsonb_typeof(s->'resources') is distinct from 'object' or (select count(*) from jsonb_object_keys(s->'resources'))>50 then raise exception 'Invalid resources'; end if;
 for k,v in select * from jsonb_each(s->'resources') loop
  if k !~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$' or jsonb_typeof(v) is distinct from 'number' then raise exception 'Invalid resource'; end if;
  n:=v::numeric; if n<>trunc(n) or n<0 or n>999999 then raise exception 'Invalid resource value'; end if;
 end loop;
 if jsonb_typeof(s->'cards') is distinct from 'array' or jsonb_array_length(s->'cards')>500 then raise exception 'Invalid cards'; end if;
 for v in select * from jsonb_array_elements(s->'cards') loop
  if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v))<>5 or not(v ?& array['id','definitionId','quantity','equipped','notes']) or jsonb_typeof(v->'equipped') is distinct from 'boolean' or jsonb_typeof(v->'notes') is distinct from 'string' or length(v->>'notes')>4000 or jsonb_typeof(v->'quantity') is distinct from 'number' then raise exception 'Invalid held card'; end if;
  perform (v->>'id')::uuid;
  n:=(v->>'quantity')::numeric;
  if n<>trunc(n) or n<1 or n>999 or not exists(select 1 from card_definitions where id=(v->>'definitionId')::uuid and group_id=g) then raise exception 'Invalid card reference or quantity'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(s->'cards'))<>(select count(distinct x->>'id') from jsonb_array_elements(s->'cards') x) then raise exception 'Invalid duplicate held card'; end if;
end $$;

create function public.create_group(p_name text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare g uuid;
begin
 if auth.uid() is null then raise exception 'Access denied'; end if;
 insert into groups(name,host_id) values(trim(p_name),auth.uid()) returning id into g;
 insert into memberships values(g,auth.uid(),actor_name()); return g;
end $$;
create function public.create_invite(p_group uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare token_value uuid;
begin
 if not is_host(p_group) then raise exception 'Access denied'; end if;
 insert into invitations(group_id) values(p_group) returning token into token_value; return token_value;
end $$;
create function public.revoke_invite(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin update invitations set revoked=true where id=p_id and is_host(group_id); if not found then raise exception 'Access denied'; end if; end $$;
create function public.join_group(p_token uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g uuid;
begin
 if auth.uid() is null then raise exception 'Access denied'; end if;
 select group_id into g from invitations where token=p_token and not revoked and expires_at>now() for update;
 if g is null then raise exception 'Invitation unavailable or expired'; end if;
 insert into memberships values(g,auth.uid(),actor_name()) on conflict do nothing;
end $$;
create function public.create_character(p_id uuid,p_group uuid,p_state jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from groups where id=p_group for update;
 if not is_member(p_group) then raise exception 'Access denied'; end if;
 perform validate_state(p_state,p_group);
 insert into characters(id,owner_id,group_id,state) values(p_id,auth.uid(),p_group,p_state);
end $$;
create function public.save_card(p_card jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g uuid:=(p_card->>'group_id')::uuid; old card_definitions;
begin
 perform 1 from groups where id=g for update;
 if not is_host(g) then raise exception 'Access denied'; end if;
 select * into old from card_definitions where id=(p_card->>'id')::uuid for update;
 if found then
  if old.group_id<>g or old.revision<>(p_card->>'revision')::int then raise exception 'Card revision conflict'; end if;
  update card_definitions set name=p_card->>'name',kind=p_card->>'kind',effects=p_card->>'effects',requirements=p_card->>'requirements',revision=revision+1 where id=old.id;
 else
  insert into card_definitions(id,group_id,name,kind,effects,requirements) values((p_card->>'id')::uuid,g,p_card->>'name',p_card->>'kind',p_card->>'effects',p_card->>'requirements');
 end if;
end $$;

create function public.apply_action(p_id uuid,p_character uuid,p_expected integer,p_operation jsonb,p_label text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
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
 s:=c.state;
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

create function public.finish_session(p_group uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare session uuid:=gen_random_uuid();
begin
 perform 1 from groups where id=p_group for update;
 if not is_host(p_group) then raise exception 'Access denied'; end if;
 insert into checkpoints(character_id,group_id,session_id,kind,state,revision) select id,group_id,session,'session',state,revision from characters where group_id=p_group;
 return session;
end $$;
create function public.delete_checkpoint(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin delete from checkpoints where id=p_id and can_edit_character(character_id); if not found then raise exception 'Access denied'; end if; end $$;
create function public.manage_campaign(p_group uuid,p_name text,p_id uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from groups where id=p_group for update;
 if not is_host(p_group) then raise exception 'Access denied'; end if;
 if p_id is null then insert into campaigns(group_id,name) values(p_group,p_name);
 else update campaigns set status='archived' where id=p_id and group_id=p_group; update characters set campaign_id=null where campaign_id=p_id and group_id=p_group; end if;
end $$;
create function public.assign_campaign(p_character uuid,p_campaign uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g uuid;
begin
 select group_id into g from characters where id=p_character; perform 1 from groups where id=g for update;
 if not can_edit_character(p_character) then raise exception 'Access denied'; end if;
 if p_campaign is not null and not exists(select 1 from campaigns where id=p_campaign and group_id=g and status='active') then raise exception 'Invalid campaign'; end if;
 update characters set campaign_id=p_campaign where id=p_character;
end $$;
create function public.set_portrait(p_character uuid,p_path text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not can_edit_character(p_character) then raise exception 'Access denied'; end if;
 if p_path is not null and (split_part(p_path,'/',1)<>p_character::text or p_path !~ '^[0-9a-f-]+/[0-9a-f-]+\.webp$') then raise exception 'Invalid portrait path'; end if;
 update characters set portrait_path=p_path where id=p_character;
end $$;

create function public.list_invites() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'group_id',group_id,'expires_at',expires_at,'revoked',revoked)),'[]') from invitations where is_host(group_id)
$$;
-- SECURITY INVOKER intentionally applies all SELECT RLS policies to the snapshot.
create function public.get_snapshot() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'groups',coalesce((select jsonb_agg(g) from groups g),'[]'),
 'members',coalesce((select jsonb_agg(m) from memberships m),'[]'),
 'campaigns',coalesce((select jsonb_agg(c) from campaigns c),'[]'),
 'characters',coalesce((select jsonb_agg(c) from characters c),'[]'),
 'cards',coalesce((select jsonb_agg(c) from card_definitions c),'[]'),
 'actions',coalesce((select jsonb_agg(a order by a.created_at desc,a.revision desc) from actions a),'[]'),
 'checkpoints',coalesce((select jsonb_agg(c order by c.created_at desc) from checkpoints c),'[]'),
 'invitations',public.list_invites(),'pending','[]'::jsonb)
$$;

-- Deny execution of internal helpers by default; expose only the RPC surface.
revoke execute on function public.validate_state(jsonb,uuid),public.actor_name() from public,anon,authenticated;
revoke execute on function public.create_group(text),public.create_invite(uuid),public.revoke_invite(uuid),public.join_group(uuid),public.create_character(uuid,uuid,jsonb),public.save_card(jsonb),public.apply_action(uuid,uuid,integer,jsonb,text),public.finish_session(uuid),public.delete_checkpoint(uuid),public.manage_campaign(uuid,text,uuid),public.assign_campaign(uuid,uuid),public.set_portrait(uuid,text),public.get_snapshot(),public.list_invites(),public.is_member(uuid),public.is_host(uuid),public.can_read_character(uuid),public.can_edit_character(uuid) from public,anon;
grant execute on function public.create_group(text),public.create_invite(uuid),public.revoke_invite(uuid),public.join_group(uuid),public.create_character(uuid,uuid,jsonb),public.save_card(jsonb),public.apply_action(uuid,uuid,integer,jsonb,text),public.finish_session(uuid),public.delete_checkpoint(uuid),public.manage_campaign(uuid,text,uuid),public.assign_campaign(uuid,uuid),public.set_portrait(uuid,text),public.get_snapshot(),public.list_invites(),public.is_member(uuid),public.is_host(uuid),public.can_read_character(uuid),public.can_edit_character(uuid) to authenticated;
