/* M1 development sync. Plaintext local storage; no AI or independent backup service. */
const CMS = {paused:new URLSearchParams(location.search).get('restore')==='1',client:null, user:null, context:null, generation:0, error:'', lastSync:null,
  conflictCount:0, busy:false, recovery:false, retryAt:0, failures:0};
CMS.configured = () => {
  const c = window.CMS_CONFIG || {};
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url || '') || !c.publishableKey || /YOUR_|^sb_secret_/.test(c.publishableKey)) return false;
  try { if (c.publishableKey.split('.').length === 3 && JSON.parse(atob(c.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role !== 'anon') return false; } catch { return false; }
  return true;
};
CMS.valid = c => !!c && CMS.context === c && c.generation === CMS.generation;
CMS.requireContext = c => { if (!CMS.valid(c)) throw Error('Account changed; operation stopped.'); return c; };
CMS.request = req => new Promise((resolve,reject) => { req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
CMS.atomic = (stores, mode, fn, c=CMS.context) => {
  CMS.requireContext(c);
  return new Promise((resolve,reject) => {
    const tx=c.db.transaction(stores,mode); let value, failure;
    tx.oncomplete=()=>resolve(value);
    tx.onerror=tx.onabort=()=>reject(failure || tx.error || Error('Local transaction aborted'));
    Promise.resolve().then(()=>fn(tx)).then(v=>{value=v;},e=>{failure=e;try{tx.abort();}catch{reject(e);}});
  });
};
CMS.all = (store,c=CMS.context) => CMS.atomic([store],'readonly',tx=>CMS.request(tx.objectStore(store).getAll()),c);
CMS.one = (store,id,c=CMS.context) => CMS.atomic([store],'readonly',tx=>CMS.request(tx.objectStore(store).get(id)),c);
CMS.uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
CMS.validate = r => {
  if (!r || typeof r.id!=='string' || !CMS.uuidPattern.test(r.id) || typeof r.type!=='string' || !Object.hasOwn(SCHEMAS,r.type) || typeof r.date!=='string' || !Number.isFinite(Date.parse(r.date))) throw Error('Invalid record ID, category or date. Nothing imported.');
  if(r.source!==undefined&&typeof r.source!=='string')throw Error('Invalid record source.');
  for (const [key,,kind] of SCHEMAS[r.type]) if (kind==='number' && r[key]!==undefined && (typeof r[key]!=='number' || !Number.isFinite(r[key]))) throw Error('Invalid numeric field: '+key);
  if (new TextEncoder().encode(JSON.stringify(r)).length>60000) throw Error('Record is too large.');
};
CMS.queueSave = async (record,deleted=false,c=CMS.context) => {
  CMS.requireContext(c); CMS.validate(record);
  await CMS.atomic(['entries','mutations','conflicts','history'],'readwrite',async tx=>{
    const entries=tx.objectStore('entries'), previous=await CMS.request(entries.get(record.id));
    if (await CMS.request(tx.objectStore('conflicts').get(record.id))) throw Error('Resolve this record’s conflict before editing it.');
    if (previous && record._localRevision !== previous._localRevision) throw Error('This record changed while you were editing. Reopen it; your form has not been saved.');
    const row={...record,_serverVersion:previous?._serverVersion||0,_localRevision:uuid(),_deleted:deleted,_sync:'pending',updatedAt:new Date().toISOString()};
    if (previous) tx.objectStore('history').add({record:previous,reason:'local-edit',at:new Date().toISOString()});
    entries.put(row);
    tx.objectStore('mutations').add({id:row.id,mutationId:uuid(),record:row,deleted,attempted:false});
  },c);
  CMS.updateStatus(); CMS.sync().catch(CMS.report);
};
CMS.queueDelete = async id => { const c=CMS.context, r=await CMS.one('entries',id,c); if(r) await CMS.queueSave(r,true,c); };
CMS.remoteRow = r => {
  const row={...r.payload,id:r.id,type:r.category,date:r.occurred_at,createdAt:r.created_at,updatedAt:r.updated_at,
    source:r.source,_serverVersion:Number(r.version),_localRevision:uuid(),_deleted:!!r.deleted_at,_sync:'synced'};
  CMS.validate(row); if(!Number.isSafeInteger(row._serverVersion)||row._serverVersion<1) throw Error('Invalid cloud version.'); return row;
};
CMS.upload = async (seq,c=CMS.context) => {
  // Persist the exact attempt BEFORE network I/O. Successors never replace it.
  const op=await CMS.atomic(['mutations','entries','conflicts'],'readwrite',async tx=>{
    const store=tx.objectStore('mutations'), item=await CMS.request(store.get(seq));
    if(!item || await CMS.request(tx.objectStore('conflicts').get(item.id))) return null;
    if(!item.attempted) {
      const row=await CMS.request(tx.objectStore('entries').get(item.id));
      item.baseVersion=row?._serverVersion||0; item.attempted=true; store.put(item);
    }
    return item;
  },c);
  if(!op)return;
  CMS.requireContext(c);
  const r=op.record, payload={};
  for(const [k,v] of Object.entries(r)) if(!['id','type','date','createdAt','updatedAt','source'].includes(k)&&!k.startsWith('_'))payload[k]=v;
  const {data,error}=await CMS.network(c.remote.rpc('write_health_entry',{p_mutation_id:op.mutationId,p_entry_id:r.id,
    p_expected_version:op.baseVersion,p_category:r.type,p_occurred_at:new Date(r.date).toISOString(),
    p_payload:payload,p_source:r.source||'manual',p_delete:op.deleted}));
  CMS.requireContext(c); if(error)throw error;
  if(!data || !['accepted','duplicate','conflict'].includes(data.status))throw Error('Invalid RPC response; pending operation retained.');
  if(data.status!=='conflict' && (!Number.isSafeInteger(Number(data.version))||Number(data.version)<1))throw Error('Invalid RPC version; pending operation retained.');
  await CMS.atomic(['mutations','entries','conflicts','history'],'readwrite',async tx=>{
    const mutations=tx.objectStore('mutations'), current=await CMS.request(mutations.get(seq));
    if(!current || current.mutationId!==op.mutationId)return;
    const entries=tx.objectStore('entries'), local=await CMS.request(entries.get(r.id));
    if(data.status==='conflict') {
      tx.objectStore('conflicts').put({id:r.id,local,server:data.server_entry||null,serverVersion:data.server_version,
        operation:op,detectedAt:new Date().toISOString()});
      if(local) entries.put({...local,_sync:'conflict'});
      return; // Keep every operation and both candidates until explicit resolution.
    }
    mutations.delete(seq);
    tx.objectStore('history').add({record:op.record,reason:'acknowledged',version:Number(data.version),at:new Date().toISOString()});
    // Preserve any edit queued while the request was in flight.
    if(local?._localRevision!==op.record._localRevision) {
      if(local)entries.put({...local,_serverVersion:Number(data.version)});
    } else {
      // Duplicate responses intentionally omit entry in migration 001. Pull reconciles it.
      entries.put(data.entry?CMS.remoteRow(data.entry):{...local,_serverVersion:Number(data.version),_sync:'synced'});
    }
  },c);
};
CMS.network = query => query.abortSignal(AbortSignal.timeout(20000));
CMS.pull = async (c=CMS.context) => {
  // Stable immutable UUID keyset scan. Full scans repeat; never infer hard deletes.
  let after=null;
  while(true) {
    CMS.requireContext(c);
    let query=c.remote.from('health_entries').select('*').order('id',{ascending:true}).limit(500);
    if(after)query=query.gt('id',after);
    const {data,error}=await CMS.network(query); CMS.requireContext(c); if(error)throw error;
    if(!Array.isArray(data))throw Error('Invalid pull response.');
    if(!data.length)break;
    const converted=data.map(CMS.remoteRow);
    await CMS.atomic(['entries','mutations','conflicts','history'],'readwrite',async tx=>{
      const pending=new Set((await CMS.request(tx.objectStore('mutations').getAll())).map(x=>x.id));
      const conflicts=new Set((await CMS.request(tx.objectStore('conflicts').getAll())).map(x=>x.id));
      const entries=tx.objectStore('entries');
      for(const row of converted) {
        if(pending.has(row.id)||conflicts.has(row.id))continue;
        const previous=await CMS.request(entries.get(row.id));
        if(!previous || Number(previous._serverVersion||0)<row._serverVersion) {
          if(previous)tx.objectStore('history').add({record:previous,reason:'cloud-update',at:new Date().toISOString()});
          entries.put(row);
        }
      }
    },c);
    const next=data.at(-1).id;
    if(after && next<=after)throw Error('Cloud pagination did not advance.'); after=next;
    // Do not rely on response row caps matching our requested limit.
  }
};
CMS.report = e => {CMS.error=e?.message||String(e); CMS.updateStatus();};
CMS.sync = async (manual=false) => {
  const c=CMS.context;
  if(!c||CMS.recovery||CMS.paused||CMS.busy||!navigator.onLine||(!manual&&Date.now()<CMS.retryAt))return;
  if(!navigator.locks) {CMS.error='This browser cannot coordinate safe multi-tab sync. Local changes remain queued; use a current browser on HTTPS or localhost.';CMS.updateStatus();return;}
  CMS.busy=true; CMS.error=''; CMS.updateStatus();
  try {
    await navigator.locks.request('cmshealth-sync-'+c.user.id,{ifAvailable:true},async lock=>{
      if(!lock)return;
      CMS.requireContext(c);
      for(const op of await CMS.all('mutations',c)){if(CMS.paused)break;await CMS.upload(op.seq,c);}
      if(CMS.paused)return;
      await CMS.pull(c); CMS.requireContext(c);
      CMS.lastSync=new Date(); CMS.failures=0; CMS.retryAt=0; await reload(c);
    });
  } catch(e) {
    if(CMS.valid(c)) {CMS.error=e.message||String(e); CMS.retryAt=Date.now()+Math.min(60000,1000*2**Math.min(++CMS.failures,6));}
  } finally {
    CMS.busy=false;
    if(CMS.valid(c)){CMS.conflictCount=(await CMS.all('conflicts',c)).length;CMS.updateStatus();}
  }
};
CMS.updateStatus = async () => {
  const c=CMS.context, a=document.getElementById('syncStatus'), b=document.getElementById('syncDetail');if(!a||!b)return;
  if(!c){a.textContent='Not signed in';b.textContent='Sign in to sync.';return;}
  try {
    const pending=(await CMS.all('mutations',c)).length, conflicts=(await CMS.all('conflicts',c)).length;
    if(!CMS.valid(c))return; CMS.conflictCount=conflicts;
    a.textContent=CMS.paused?(CMS.busy?'Cloud sync pausing · current request may finish':'Cloud sync paused · local storage only'):!navigator.onLine?'Offline · saved on this device':CMS.error?'Sync error':CMS.busy?'Synchronizing…':conflicts?'Conflict needs review':pending?'Saved locally · pending':CMS.lastSync?'Cloud checked · no pending changes':'Local cache · cloud not checked';
    b.textContent=`${pending} pending · ${conflicts} conflicts${CMS.lastSync?' · Last successful scan '+CMS.lastSync.toLocaleTimeString():''}${CMS.error?' · '+CMS.error:''}`;
  }catch(e){if(CMS.valid(c)){a.textContent='Local storage error';b.textContent=e.message;}}
};
CMS.authPanel = () => `<div class="card" style="max-width:540px;margin:35px auto"><h1>Welcome to CMsHealth</h1><p class="subtle">M1 development build · dummy records only. Your existing M0 records are not uploaded automatically.</p>${CMS.configured()?`<form onsubmit="CMS.signIn(event)" class="authform"><label class="field">Email<input id="authEmail" type="email" autocomplete="email" required></label><label class="field">Password<input id="authPassword" type="password" minlength="8" autocomplete="current-password" required></label><div class="flexwrap"><button class="btn" type="submit">Sign in</button><button class="btn secondary" type="button" onclick="CMS.signUp()">Create account</button><button class="btn secondary" type="button" onclick="CMS.resetPassword()">Reset password</button></div></form><button class="btn secondary" onclick="CMS.googleLogin()">Sign in with Google</button>`:'<p class="notice">Configure your public Supabase URL and publishable/anon key in config.local.js. Never use a secret or service-role key. See M1_SETUP.md.</p>'}${CMS.error?`<p class="notice" role="alert">${esc(CMS.error)}</p>`:''}</div>`;
CMS.recoveryPanel = () => `<div class="card"><h1>Set a new password</h1><form class="authform" onsubmit="CMS.updatePassword(event)"><label class="field">New password<input id="newPassword" type="password" autocomplete="new-password" minlength="8" required></label><label class="field">Confirm password<input id="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn">Update password</button><button type="button" class="btn secondary" onclick="CMS.cancelRecovery()">Cancel recovery</button></form>${CMS.error?`<p role="alert">${esc(CMS.error)}</p>`:''}</div>`;
CMS.authAction = async action => {
  if(CMS.authBusy)return;CMS.authBusy=true;CMS.error='';
  try{await action();}catch(e){CMS.error=e.message||String(e);render();}finally{CMS.authBusy=false;}
};
CMS.credentials = () => ({email:document.getElementById('authEmail').value.trim(),password:document.getElementById('authPassword').value});
CMS.signIn = e => {e.preventDefault();return CMS.authAction(async()=>{const {error}=await CMS.client.auth.signInWithPassword(CMS.credentials());if(error)throw error;});};
CMS.signUp = () => CMS.authAction(async()=>{
  const credentials=CMS.credentials(); if(!credentials.email||credentials.password.length<8)throw Error('Enter an email and a password of at least 8 characters.');
  const {error}=await CMS.client.auth.signUp({...credentials,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;
  alert('Check your email for confirmation if required.');
});
CMS.resetPassword = () => CMS.authAction(async()=>{
  const email=CMS.credentials().email;if(!email)throw Error('Enter your email first.');
  const callback=new URL(location.pathname,location.origin);callback.searchParams.set('recovery','1');
  const {error}=await CMS.client.auth.resetPasswordForEmail(email,{redirectTo:callback.href});if(error)throw error;
  alert('If the account exists, a recovery link has been sent.');
});
CMS.cancelRecovery = () => {CMS.recovery=false;history.replaceState(null,'',location.pathname);render();};
CMS.updatePassword = e => {e.preventDefault();return CMS.authAction(async()=>{
  const password=document.getElementById('newPassword').value;
  if(password.length<8||password!==document.getElementById('confirmPassword').value)throw Error('Passwords must match and contain at least 8 characters.');
  const {error}=await CMS.client.auth.updateUser({password});if(error)throw error;
  CMS.recovery=false;history.replaceState(null,'',location.pathname);render();toast('Password updated.');CMS.sync().catch(CMS.report);
});};
CMS.googleLogin = () => CMS.authAction(async()=>{const {error}=await CMS.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error)throw error;});
CMS.signOut = () => CMS.authAction(async()=>{
  const c=CMS.context;if(!c)return;
  if((await CMS.all('mutations',c)).length&&!confirm('Pending changes remain only in this account’s cache on this device. Sign out of this device?'))return;
  const {error}=await CMS.client.auth.signOut({scope:'local'});if(error)throw error;
  await CMS.switchUser(null);CMS.recovery=false;render();
});
CMS.togglePause = () => {CMS.paused=!CMS.paused;CMS.updateStatus();render();if(!CMS.paused)CMS.sync(true);};
CMS.settingsPanel = () => `<div class="card" style="margin-bottom:16px"><h3>Account and synchronization</h3><p class="subtle">Signed in: ${esc(CMS.user?.email||'—')}</p><p class="subtle" role="status">${esc(CMS.error||'Changes are committed locally before upload. Conflict versions are retained for review.')}</p><div class="flexwrap"><button class="btn" onclick="CMS.sync(true)">Sync now</button><button class="btn secondary" onclick="CMS.togglePause()">${CMS.paused?'Resume cloud sync':'Pause cloud sync'}</button><button class="btn secondary" onclick="CMS.showConflicts()">Review conflicts</button><button class="btn secondary" onclick="CMS.signOut()">Sign out of this device</button></div><p class="fineprint">Plaintext local data. No encryption or independent backup service. Dummy records only.</p></div>`;
CMS.showConflicts = async () => {
  const c=CMS.context, items=await CMS.all('conflicts',c);CMS.requireContext(c);
  const modal=document.getElementById('modal');modal.classList.remove('hidden');
  modal.innerHTML=`<div class="modalbox"><h2>Synchronization conflicts</h2><button class="btn secondary" onclick="closeModal()">Close</button>${items.map((x,i)=>`<section class="card"><h3>${esc(x.local?.type)} · ${esc(x.local?.date)}</h3><p>Local candidate</p><pre class="conflictdata">${esc(JSON.stringify(x.local,null,2))}</pre><p>Cloud candidate</p><pre class="conflictdata">${esc(JSON.stringify(x.server,null,2))}</pre><button class="btn" data-conflict="${i}" data-choice="local">Keep local</button><button class="btn secondary" data-conflict="${i}" data-choice="server">Keep cloud</button><p class="fineprint">Both candidates and your decision remain in local history. Export a recovery archive first.</p></section>`).join('')||'<p>No conflicts.</p>'}</div>`;
  modal.querySelectorAll('[data-conflict]').forEach(b=>b.onclick=()=>CMS.resolve(items[Number(b.dataset.conflict)].id,b.dataset.choice,c).catch(CMS.report));
};
CMS.resolve = async (id,choice,c=CMS.context) => {
  if(!['local','server'].includes(choice))throw Error('Invalid conflict choice.');
  await CMS.atomic(['entries','mutations','conflicts','history'],'readwrite',async tx=>{
    const conflicts=tx.objectStore('conflicts'), conflict=await CMS.request(conflicts.get(id));if(!conflict)return;
    const current=await CMS.request(tx.objectStore('entries').get(id));
    tx.objectStore('history').add({conflict,record:current,choice,reason:'conflict-resolution',at:new Date().toISOString()});
    const mutations=tx.objectStore('mutations');for(const op of await CMS.request(mutations.getAll()))if(op.id===id)mutations.delete(op.seq);
    if(choice==='server') {
      // A missing cloud row must not erase the local record from recovery history.
      tx.objectStore('entries').put(conflict.server?CMS.remoteRow(conflict.server):{...current,_deleted:true,_sync:'synced',_localRevision:uuid()});
    } else {
      const absentDeletion=current._deleted&&conflict.serverVersion==null;
      const row={...current,_serverVersion:Number(conflict.serverVersion)||0,_localRevision:uuid(),_sync:absentDeletion?'synced':'pending'};
      tx.objectStore('entries').put(row);if(!absentDeletion)mutations.add({id,mutationId:uuid(),record:row,deleted:!!row._deleted,attempted:false});
    }
    conflicts.delete(id);
  },c);
  CMS.requireContext(c);closeModal();await reload(c);CMS.sync().catch(CMS.report);
};
CMS.remoteFor = session => window.supabase.createClient(window.CMS_CONFIG.url,window.CMS_CONFIG.publishableKey,
  {global:{headers:{Authorization:'Bearer '+session.access_token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
CMS.switchUser = async (user,session=null) => {
  const generation=++CMS.generation, previous=CMS.context;
  CMS.context=null; CMS.user=null;state.db=null;state.records=[];state.filter='';state.query='';state.page='dashboard';CMS.lastSync=null;CMS.error='';CMS.conflictCount=0;
  closeModal();render();if(previous)previous.db.close();
  if(!user){CMS.updateStatus();return;}
  const db=await openDB(user.id);if(generation!==CMS.generation){db.close();return;}
  const c={user,db,generation,remote:session?CMS.remoteFor(session):CMS.client};
  CMS.context=c;CMS.user=user;state.db=db;
  db.onversionchange=()=>{if(CMS.valid(c)){CMS.switchUser(null);CMS.report(Error('Local storage upgraded in another tab. Reload this tab.'));}db.close();};
  await reload(c);CMS.updateStatus();CMS.sync().catch(CMS.report);
};
CMS.handleAuth = (event,session) => {
  if(event==='PASSWORD_RECOVERY') {CMS.recovery=true;render();}
  const user=session?.user||null;
  if(user?.id!==CMS.user?.id || (!user&&CMS.context))return CMS.switchUser(user,session);
  if(CMS.context&&session)CMS.context.remote=CMS.remoteFor(session);
  render();CMS.updateStatus();
};
CMS.init = async () => {
  if(!CMS.configured()){render();return;}
  if(!window.supabase?.createClient){CMS.error='The bundled authentication SDK failed to load.';render();return;}
  // Detect recovery before initial session callback to avoid displaying records first.
  CMS.recovery=new URLSearchParams(location.search).get('recovery')==='1'||new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
  CMS.client=window.supabase.createClient(window.CMS_CONFIG.url,window.CMS_CONFIG.publishableKey,
    {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  CMS.client.auth.onAuthStateChange((event,session)=>{
    // No awaited Supabase calls in this callback; invalidate account state immediately.
    Promise.resolve(CMS.handleAuth(event,session)).catch(CMS.report);
  });
  const generation=CMS.generation, {data,error}=await CMS.client.auth.getSession();
  if(error)throw error;
  if(generation===CMS.generation)await CMS.handleAuth('INITIAL_SESSION',data?.session);
  window.addEventListener('online',()=>CMS.sync(true));window.addEventListener('offline',()=>CMS.updateStatus());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)CMS.sync();});
  setInterval(()=>CMS.sync(),15000);
};
window.CMS=CMS;
