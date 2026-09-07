-- Atomic import: a malformed character or invalid reference rolls back all writes.
create function public.import_bundle(p_group uuid,p_cards jsonb,p_characters jsonb,p_replace uuid,p_expected integer,p_action uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb; d jsonb;
begin
 perform 1 from groups where id=p_group for update;
 if not is_member(p_group) then raise exception 'Access denied'; end if;
 if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_typeof(p_characters) is distinct from 'array' or jsonb_array_length(p_characters) not between 1 and 500 or jsonb_array_length(p_cards)>2000 then raise exception 'Invalid import'; end if;
 if p_replace is not null and (jsonb_array_length(p_characters)<>1 or not exists(select 1 from characters where id=p_replace and group_id=p_group) or not can_edit_character(p_replace)) then raise exception 'Access denied'; end if;
 for d in select * from jsonb_array_elements(p_cards) loop
  if (d->>'group_id')::uuid<>p_group then raise exception 'Invalid card group'; end if;
  perform save_card(d);
 end loop;
 for c in select * from jsonb_array_elements(p_characters) loop
  if p_replace is not null then
   perform apply_action(p_action,p_replace,p_expected,jsonb_build_object('kind','replace','state',c->'state'),'Imported backup over character');
  else perform create_character((c->>'id')::uuid,p_group,c->'state'); end if;
 end loop;
end $$;
revoke execute on function public.import_bundle(uuid,jsonb,jsonb,uuid,integer,uuid) from public,anon;
grant execute on function public.import_bundle(uuid,jsonb,jsonb,uuid,integer,uuid) to authenticated;
