const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();let checks=0;
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 // PGlite provides core gen_random_uuid(), but does not ship pgcrypto. No other SQL is altered.
 await db.exec(fs.readFileSync('migrations/001_secure_core.sql','utf8').replace('create extension if not exists pgcrypto;','-- pgcrypto availability is a live Supabase check.'));
 await db.exec(fs.readFileSync('migrations/002_rpc_input_hardening.sql','utf8'));
 const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', id='11111111-1111-4111-8111-111111111111';
 await db.exec(`insert into auth.users values ('${A}'),('${B}');`);
 const as=async(role,user)=>db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${user||''}',false);`);
 const call=async(mutation,expected,deleted=false,entry=id)=>{
  const r=await db.query('select public.write_health_entry($1,$2,$3,$4,$5,$6,$7,$8) as result',[mutation,entry,expected,'vitals','2026-10-19T10:00:00Z',{systolic:120,diastolic:80},'manual',deleted]);return r.rows[0].result;
 };
 const m=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
 await as('anon');await assert.rejects(()=>call(m(1),0));checks++;
 await assert.rejects(()=>db.query('select * from health_entries'));checks++;
 await as('authenticated');await assert.rejects(()=>call(m(1),0));checks++;
 await as('authenticated',A);
 await assert.rejects(()=>call(m(1),null));checks++;
 await assert.rejects(()=>call(m(1),-1));checks++;
 const accepted=await call(m(1),0);assert.equal(accepted.status,'accepted');assert.equal(accepted.version,1);checks++;
 assert.equal((await call(m(1),0)).status,'duplicate');checks++;
 await assert.rejects(()=>call(m(1),0,false,'22222222-2222-4222-8222-222222222222'));checks++;
 assert.equal((await call(m(2),0)).status,'conflict');checks++;
 assert.equal((await call(m(3),1)).version,2);checks++;
 assert.equal((await call(m(4),1)).status,'conflict');checks++;
 assert.equal((await call(m(5),2,true)).version,3);checks++;
 assert.equal((await db.query('select source from entry_revisions order by version')).rows[0].source,'manual');checks++;
 const rows=await db.query('select * from health_entries');assert.ok(rows.rows[0].deleted_at);checks++;
 assert.equal((await db.query('select * from entry_revisions')).rows.length,3);checks++;
 for(const table of ['health_entries','entry_revisions','sync_receipts']){await assert.rejects(()=>db.query(`delete from ${table}`));checks++;}
 await db.exec(`insert into profiles(user_id,display_name)values('${A}','Dummy A')`);
 await as('authenticated',B);
 for(const table of ['profiles','health_entries','entry_revisions','sync_receipts']){assert.equal((await db.query(`select * from ${table}`)).rows.length,0);checks++;}
 assert.deepEqual(await call(m(6),0),{status:'conflict',server_version:null});checks++;
 await assert.rejects(()=>db.exec(`insert into profiles(user_id)values('${A}')`));checks++;
 await as('authenticated',A);assert.equal((await db.query('select * from sync_receipts')).rows.length,3);checks++;
 await as('postgres'); // reset to owner; role postgres exists in PGlite
 for(const table of ['health_entries','entry_revisions','sync_receipts']){assert.equal((await db.query("select has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE') as allowed",['public.'+table])).rows[0].allowed,false);checks++;}
 assert.equal((await db.query("select has_function_privilege('anon','public.write_health_entry(uuid,uuid,bigint,text,timestamptz,jsonb,text,boolean)','EXECUTE') as allowed")).rows[0].allowed,false);checks++;
 const flags=await db.query("select relname,relrowsecurity from pg_class where relname in ('profiles','health_entries','entry_revisions','sync_receipts')");assert.equal(flags.rows.length,4);assert.ok(flags.rows.every(x=>x.relrowsecurity));checks++;
 console.log(`${checks} SQL assertions passed in embedded PostgreSQL. Live Supabase and multi-connection concurrency NOT tested.`);await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
