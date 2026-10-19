-- Additive function hardening; no table/record deletion or original migration rerun.
-- Review and back up first. Not applied to the owner's live project by Codex.
begin;
-- Original source values cannot be reconstructed for old revisions; leave them NULL.
alter table public.entry_revisions add column if not exists source text;
create or replace function public.write_health_entry(
 p_mutation_id uuid, p_entry_id uuid, p_expected_version bigint,
 p_category text, p_occurred_at timestamptz, p_payload jsonb,
 p_source text default 'manual', p_delete boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_row public.health_entries%rowtype; v_receipt public.sync_receipts%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_expected_version is null or p_expected_version<0 or p_delete is null then raise exception 'Invalid version or deletion flag'; end if;
 if p_mutation_id is null or p_entry_id is null then raise exception 'Missing identifiers'; end if;
 if p_category not in ('vitals','symptoms','nutrition','exercise','habits','sleep','medications','records') or p_category is null then raise exception 'Invalid category'; end if;
 if p_occurred_at is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Invalid entry'; end if;
 if pg_column_size(p_payload)>65536 then raise exception 'Payload too large'; end if;
 -- Serialize a receipt identity before the entry identity, consistently.
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':mutation:' || p_mutation_id::text,0));
 -- Serialize the globally unique entry ID, including cross-owner collisions.
 perform pg_advisory_xact_lock(hashtextextended('entry:' || p_entry_id::text,0));
 select * into v_receipt from public.sync_receipts where user_id=v_uid and mutation_id=p_mutation_id;
 if found then
   if v_receipt.entry_id<>p_entry_id then raise exception 'Mutation ID reused for different entry'; end if;
   return jsonb_build_object('status','duplicate','version',v_receipt.resulting_version);
 end if;
 select * into v_row from public.health_entries where id=p_entry_id and user_id=v_uid for update;
 if not found then
   if exists(select 1 from public.health_entries where id=p_entry_id) then return jsonb_build_object('status','conflict','server_version',null); end if;
   if p_expected_version<>0 or p_delete then return jsonb_build_object('status','conflict','server_version',null); end if;
   insert into public.health_entries(id,user_id,category,occurred_at,payload,source)
   values(p_entry_id,v_uid,p_category,p_occurred_at,p_payload,coalesce(p_source,'manual')) returning * into v_row;
 else
   if p_expected_version is distinct from v_row.version then
     return jsonb_build_object('status','conflict','server_version',v_row.version,'server_entry',to_jsonb(v_row));
   end if;
   update public.health_entries set category=p_category, occurred_at=p_occurred_at,
     payload=p_payload,source=coalesce(p_source,'manual'),
     deleted_at=case when p_delete then now() else null end,
     version=version+1,updated_at=now()
   where id=p_entry_id and user_id=v_uid returning * into v_row;
 end if;
 insert into public.entry_revisions(entry_id,user_id,version,category,occurred_at,payload,deleted_at,source)
 values(v_row.id,v_uid,v_row.version,v_row.category,v_row.occurred_at,v_row.payload,v_row.deleted_at,v_row.source);
 insert into public.sync_receipts(user_id,mutation_id,entry_id,resulting_version)
 values(v_uid,p_mutation_id,p_entry_id,v_row.version);
 return jsonb_build_object('status','accepted','version',v_row.version,'entry',to_jsonb(v_row));
end $$;
revoke all on function public.write_health_entry(uuid,uuid,bigint,text,timestamptz,jsonb,text,boolean) from public,anon;
grant execute on function public.write_health_entry(uuid,uuid,bigint,text,timestamptz,jsonb,text,boolean) to authenticated;
commit;
