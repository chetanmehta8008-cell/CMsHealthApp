-- Original migration supplied by the owner during the M1 audit.
-- Whitespace normalized from chat; SQL semantics preserved. ALREADY APPLIED: do not rerun.
-- CMsHealth M1 fresh Supabase project only. Review before executing.
-- This migration is NOT a backup, encryption, or full offline-sync implementation.
begin;
create extension if not exists pgcrypto;
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text, timezone text not null default 'Asia/Kolkata',
 created_at timestamptz not null default now()
);
create table public.health_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 category text not null check (category in ('vitals','symptoms','nutrition','exercise','habits','sleep','medications','records')),
 occurred_at timestamptz not null,
 payload jsonb not null default '{}'::jsonb,
 source text not null default 'manual',
 version bigint not null default 1 check (version > 0),
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index health_entries_owner_time on public.health_entries(user_id,occurred_at desc);
create index health_entries_owner_updated on public.health_entries(user_id,updated_at,id);
create table public.entry_revisions (
 revision_id uuid primary key default gen_random_uuid(),
 entry_id uuid not null references public.health_entries(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 version bigint not null,
 category text not null,
 occurred_at timestamptz not null,
 payload jsonb not null,
 deleted_at timestamptz,
 recorded_at timestamptz not null default now(),
 unique(entry_id,version)
);
-- RLS protects each account, including when additional accounts exist later.
alter table public.profiles enable row level security;
alter table public.health_entries enable row level security;
alter table public.entry_revisions enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (user_id=(select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated with check (user_id=(select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy entries_read on public.health_entries for select to authenticated using (user_id=(select auth.uid()));
create policy revisions_read on public.entry_revisions for select to authenticated using (user_id=(select auth.uid()));
-- No direct table writes from browser. All mutations use an authenticated RPC.
revoke all on public.profiles, public.health_entries, public.entry_revisions from anon;
revoke all on public.health_entries, public.entry_revisions from authenticated;
grant select on public.health_entries, public.entry_revisions to authenticated;
grant select,insert,update on public.profiles to authenticated;
-- Compare-and-swap write, with idempotency via a stable client mutation UUID.
create table public.sync_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 mutation_id uuid not null,
 entry_id uuid not null,
 resulting_version bigint not null,
 created_at timestamptz not null default now(),
 primary key(user_id,mutation_id)
);
alter table public.sync_receipts enable row level security;
create policy receipts_read on public.sync_receipts for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.sync_receipts from anon,authenticated;
grant select on public.sync_receipts to authenticated;
create or replace function public.write_health_entry(
 p_mutation_id uuid, p_entry_id uuid, p_expected_version bigint,
 p_category text, p_occurred_at timestamptz, p_payload jsonb,
 p_source text default 'manual', p_delete boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_row public.health_entries%rowtype; v_receipt public.sync_receipts%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_mutation_id is null or p_entry_id is null then raise exception 'Missing identifiers'; end if;
 if p_category not in ('vitals','symptoms','nutrition','exercise','habits','sleep','medications','records') or p_category is null then raise exception 'Invalid category'; end if;
 if p_occurred_at is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Invalid entry'; end if;
 if pg_column_size(p_payload)>65536 then raise exception 'Payload too large'; end if;
 -- Serialize mutations per user/entry to prevent competing inserts and updates.
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_entry_id::text,0));
 select * into v_receipt from public.sync_receipts where user_id=v_uid and mutation_id=p_mutation_id;
 if found then
   if v_receipt.entry_id<>p_entry_id then raise exception 'Mutation ID reused for different entry'; end if;
   return jsonb_build_object('status','duplicate','version',v_receipt.resulting_version);
 end if;
 select * into v_row from public.health_entries where id=p_entry_id and user_id=v_uid for update;
 if not found then
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
 insert into public.entry_revisions(entry_id,user_id,version,category,occurred_at,payload,deleted_at)
 values(v_row.id,v_uid,v_row.version,v_row.category,v_row.occurred_at,v_row.payload,v_row.deleted_at);
 insert into public.sync_receipts(user_id,mutation_id,entry_id,resulting_version)
 values(v_uid,p_mutation_id,p_entry_id,v_row.version);
 return jsonb_build_object('status','accepted','version',v_row.version,'entry',to_jsonb(v_row));
end $$;
revoke all on function public.write_health_entry(uuid,uuid,bigint,text,timestamptz,jsonb,text,boolean) from public,anon;
grant execute on function public.write_health_entry(uuid,uuid,bigint,text,timestamptz,jsonb,text,boolean) to authenticated;
commit;
