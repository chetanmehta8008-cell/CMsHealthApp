// Real Chromium IndexedDB/service-worker smoke tests. No live Supabase requests.
const {chromium}=require('playwright-core');const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd(), server=http.createServer((req,res)=>{
  const file=path.join(root,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(req.url==='/config.local.js'){res.setHeader('Content-Type','application/javascript');res.end('// No live project configured in browser tests.');return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(data)});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 let browser;try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.getByText('Configure your public Supabase URL',{exact:false}).waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 assert.equal(await page.evaluate(()=>typeof window.supabase.createClient),'function');
 // Inject a dummy account context only. Exercise actual app forms and IndexedDB.
 const seed=async tab=>tab.evaluate(async()=>{
  navigator.onLine;CMS.sync=async()=>{};const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'dummy@example.invalid'};
  await CMS.switchUser(user);window.alert=message=>{window.lastAlert=message};window.confirm=()=>true;
 });
 await seed(page);await page.getByRole('button',{name:'＋ Add entry',exact:true}).click();
 await page.locator('[name=heartRate]').fill('72');await page.locator('[name=systolic]').fill('120');await page.locator('[name=diastolic]').fill('80');await page.getByRole('button',{name:'Save record',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.getByText('120/80',{exact:true}).waitFor();
 assert.equal(await page.evaluate(async()=>(await CMS.all('mutations')).length),1);
 const second=await context.newPage();await second.goto(origin);await seed(second);
 const originals=await page.evaluate(async()=>await CMS.all('entries'));const id=originals[0].id;
 await page.evaluate(id=>entryModal('vitals',id),id);await second.evaluate(id=>entryModal('vitals',id),id);
 await page.locator('[name=heartRate]').fill('');await page.locator('[name=systolic]').fill('125');await page.getByRole('button',{name:'Save record',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
 await second.locator('[name=systolic]').fill('130');await second.getByRole('button',{name:'Save record',exact:true}).click();
 await second.waitForFunction(()=>!!window.lastAlert);assert.match(await second.evaluate(()=>window.lastAlert),/changed while/);
 assert.equal(await second.evaluate(async id=>(await CMS.one('entries',id)).systolic,id),125);assert.equal(await second.evaluate(async id=>(await CMS.one('entries',id)).heartRate,id),undefined);
 await second.close();
 // Complete recovery archive roundtrip in a fresh browser profile, without cloud pull.
 const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>exportJSON());const download=await downloadPromise;
 const archive=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(archive.schemaVersion,2);assert.equal(archive.mutations.length,2);assert.ok(archive.history.length);
 const restoreContext=await browser.newContext();const restored=await restoreContext.newPage();await restored.goto(origin);await seed(restored);
 const outcome=await restored.evaluate(async archive=>{
  await importJSON(new File([JSON.stringify(archive)],'dummy-recovery.json',{type:'application/json'}));
  return {entries:await CMS.all('entries'),mutations:await CMS.all('mutations'),history:await CMS.all('history'),error:window.lastAlert};
 },archive);
 assert.equal(outcome.error,undefined);assert.deepEqual(outcome.entries,archive.entries);assert.deepEqual(outcome.mutations,archive.mutations);assert.deepEqual(outcome.history,archive.history);
 // Collision restore aborts atomically.
 await restored.evaluate(async archive=>importJSON(new File([JSON.stringify(archive)],'dummy.json')),archive);
 assert.match(await restored.evaluate(()=>window.lastAlert),/empty cache/);
 assert.equal(await restored.evaluate(async()=>(await CMS.all('entries')).length),1);
 await restoreContext.close();
 // Offline cold start: actual service worker cache supplies SDK and app shell.
 await context.setOffline(true);await page.reload();assert.equal(await page.evaluate(()=>typeof window.supabase.createClient),'function');
 await seed(page);await page.getByText('125/80',{exact:true}).waitFor();assert.equal(await page.evaluate(async()=>(await CMS.all('entries')).length),1);
 assert.deepEqual(errors,[]);console.log('Chromium: form save, cross-tab stale-edit protection, full recovery roundtrip, collision rollback and offline cold start passed.');
 // Exercise the actual SDK against deterministic auth/PostgREST fixtures.
 const cloud=await browser.newContext();const cloudPage=await cloud.newPage();const cloudErrors=[];
 cloudPage.on('pageerror',e=>cloudErrors.push(e.message));
 const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'dummy@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 const token='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test-signature';
 const records=new Map();const rpcCalls=[];let recoveries=0,passwordUpdates=0,pkceExchanges=0;
 await cloud.route('**/config.local.js',route=>route.fulfill({contentType:'application/javascript',body:"window.CMS_CONFIG={url:'https://dummyproject.supabase.co',publishableKey:'sb_publishable_dummy_test_only'}"}));
 await cloud.route('https://dummyproject.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());let result={};
  if(url.pathname==='/auth/v1/token'){if(url.searchParams.get('grant_type')==='pkce'){assert.ok(req.postDataJSON().code_verifier);pkceExchanges++;}result={access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'dummy-refresh-token',user};}
  else if(url.pathname==='/auth/v1/recover'){assert.equal(new URL(url.searchParams.get('redirect_to')).searchParams.get('recovery'),'1');recoveries++;}
  else if(url.pathname==='/auth/v1/user'){if(req.method()==='PUT')passwordUpdates++;result=user;}
  else if(url.pathname==='/rest/v1/rpc/write_health_entry'){
   assert.equal(req.headers().authorization,'Bearer '+token);
   const op=req.postDataJSON(),previous=records.get(op.p_entry_id);rpcCalls.push({id:op.p_entry_id,systolic:op.p_payload.systolic});
   assert.equal(op.p_expected_version,previous?.version||0);
   const row={id:op.p_entry_id,user_id:user.id,category:op.p_category,occurred_at:op.p_occurred_at,payload:op.p_payload,source:op.p_source,version:(previous?.version||0)+1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:op.p_delete?new Date().toISOString():null};
   records.set(row.id,row);result={status:'accepted',version:row.version,entry:row};
  }else if(url.pathname==='/rest/v1/health_entries'){
   assert.equal(req.headers().authorization,'Bearer '+token);const after=url.searchParams.get('id')?.replace(/^gt\./,'');result=[...records.values()].filter(r=>!after||r.id>after).sort((a,b)=>a.id.localeCompare(b.id));
  }else if(url.pathname!=='/auth/v1/logout')throw Error('Unexpected fixture request: '+url.pathname);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await cloudPage.addInitScript(()=>{window.alert=message=>window.lastAlert=message;window.confirm=()=>true});
 await cloudPage.goto(origin);await cloudPage.locator('#authEmail').fill(user.email);await cloudPage.locator('#authPassword').fill('dummy-password-only');
 await cloudPage.getByRole('button',{name:'Reset password',exact:true}).click();await cloudPage.waitForFunction(()=>!!window.lastAlert);assert.equal(recoveries,1);
 await cloudPage.goto(origin+'/?recovery=1&code=dummy-recovery-code');await cloudPage.locator('#newPassword').waitFor({timeout:5000}).catch(async e=>{console.error('Recovery fixture diagnostic',await cloudPage.evaluate(()=>({error:CMS.error,recovery:CMS.recovery,hasAccount:!!CMS.user})),{pkceExchanges,cloudErrors});throw e;});
 await cloudPage.locator('#newPassword').fill('new-dummy-password');await cloudPage.locator('#confirmPassword').fill('new-dummy-password');await cloudPage.getByRole('button',{name:'Update password',exact:true}).click();
 await cloudPage.getByRole('button',{name:'＋ Add entry',exact:true}).waitFor();assert.equal(passwordUpdates,1);assert.equal(pkceExchanges,1);
 await cloudPage.evaluate(()=>CMS.signOut());await cloudPage.locator('#authEmail').fill(user.email);await cloudPage.locator('#authPassword').fill('new-dummy-password');
 await cloudPage.getByRole('button',{name:'Sign in',exact:true}).click();await cloudPage.getByRole('button',{name:'＋ Add entry',exact:true}).waitFor();
 await cloudPage.getByRole('button',{name:'＋ Add entry',exact:true}).click();await cloudPage.locator('[name=systolic]').fill('121');await cloudPage.locator('[name=diastolic]').fill('81');await cloudPage.getByRole('button',{name:'Save record',exact:true}).click();await cloudPage.locator('#modal').waitFor({state:'hidden'});
 await cloudPage.waitForFunction(()=>!CMS.busy&&!!CMS.lastSync);await cloudPage.evaluate(()=>CMS.sync(true));
 await cloudPage.waitForFunction(async()=>!CMS.busy&&(await CMS.all('mutations')).length===0);assert.equal(records.size,1);
 // Offline restart with a real SDK-persisted dummy session and actual IDB data.
 await cloudPage.evaluate(()=>navigator.serviceWorker.ready);await cloudPage.reload();await cloudPage.getByText('121/81',{exact:true}).waitFor();
 await cloud.setOffline(true);await cloudPage.reload();await cloudPage.getByText('121/81',{exact:true}).waitFor();
 assert.equal(await cloudPage.evaluate(()=>navigator.onLine),false);assert.equal(await cloudPage.evaluate(()=>CMS.user.email),user.email);
 await cloudPage.getByRole('button',{name:'＋ Add entry',exact:true}).click();await cloudPage.locator('[name=systolic]').fill('122');await cloudPage.locator('[name=diastolic]').fill('82');await cloudPage.getByRole('button',{name:'Save record',exact:true}).click();await cloudPage.locator('#modal').waitFor({state:'hidden'});
 assert.equal(await cloudPage.evaluate(async()=>(await CMS.all('mutations')).length),1);
 await cloud.setOffline(false);await cloudPage.evaluate(()=>CMS.sync(true));await cloudPage.waitForFunction(async()=>!CMS.busy&&(await CMS.all('mutations')).length===0);if(records.size!==2)console.error('Offline reconnect fixture diagnostic',{rpcCalls,local:await cloudPage.evaluate(async()=>({entries:await CMS.all('entries'),mutations:await CMS.all('mutations'),history:await CMS.all('history'),error:CMS.error}))});assert.equal(records.size,2);
  await cloudPage.evaluate(()=>CMS.signOut());await cloudPage.getByRole('button',{name:'Sign in',exact:true}).waitFor();
 assert.deepEqual(cloudErrors,[]);await cloud.close();
 console.log('Chromium SDK fixture: email sign-in, recovery request/update, authenticated RPC/pull and local sign-out passed (not live Supabase).');
 await context.close();
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
