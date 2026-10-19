const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb');
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id='11111111-1111-4111-8111-111111111111';
const record=()=>({id,type:'vitals',date:'2026-10-19T10:01:12.345Z',systolic:120,diastolic:80,createdAt:'2026-10-19T10:01:12Z'});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const query=promise=>({abortSignal:()=>promise});
const row=(version=1)=>({id,user_id:A,category:'vitals',occurred_at:record().date,payload:{systolic:120,diastolic:80},source:'manual',version,created_at:record().date,updated_at:record().date,deleted_at:null});
async function harness(factory=new IDBFactory()){
 const nodes=new Map();const node=()=>({innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return []}});
 const sandbox={console,crypto:webcrypto,indexedDB:factory,TextEncoder,Date,URL,URLSearchParams,AbortSignal,
  setTimeout,clearTimeout,atob,alert(){},confirm:()=>true,location:{origin:'http://localhost:8080',pathname:'/',hash:''},
  history:{replaceState(){}},localStorage:{getItem(){return null}},navigator:{onLine:false},
  document:{getElementById(key){if(!nodes.has(key))nodes.set(key,node());return nodes.get(key)},body:{classList:{toggle(){}}}}};
 sandbox.window=sandbox;const ctx=vm.createContext(sandbox);
 vm.runInContext(fs.readFileSync('sync.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('app.js','utf8').split("window.addEventListener('keydown'")[0],ctx);
 vm.runInContext('render=()=>{};toast=()=>{};CMS.updateStatus=()=>{};CMS.sync=async()=>{};',ctx);
 const CMS=sandbox.CMS,state=vm.runInContext('state',ctx),openDB=vm.runInContext('openDB',ctx);
 const db=await openDB(A);const c={db,user:{id:A},generation:1,remote:null};
 CMS.generation=1;CMS.context=c;CMS.user=c.user;state.db=db;
 return {CMS,state,c,ctx,sandbox,openDB};
}
test('local record and immutable mutation commit together; stale save aborts without side effects',async()=>{
 const {CMS}=await harness();await CMS.queueSave(record());
 assert.equal((await CMS.all('entries')).length,1);assert.equal((await CMS.all('mutations')).length,1);
 await assert.rejects(()=>CMS.queueSave({...record(),systolic:130}),/changed while/);
 assert.equal((await CMS.all('mutations')).length,1);assert.equal((await CMS.one('entries',id)).systolic,120);
});
test('concurrent stale forms cannot overwrite one another',async()=>{
 const {CMS}=await harness();const outcomes=await Promise.allSettled([CMS.queueSave(record()),CMS.queueSave({...record(),systolic:130})]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal((await CMS.all('mutations')).length,1);
});
test('delete during in-flight create remains a tombstone and uploads after acknowledgment',async()=>{
 const {CMS,c}=await harness();await CMS.queueSave(record());const response=deferred();let args;
 c.remote={rpc:(name,input)=>{args=input;return query(response.promise)}};
 const upload=CMS.upload(1);await new Promise(r=>setImmediate(r));await CMS.queueDelete(id);
 response.resolve({data:{status:'accepted',version:1,entry:row()},error:null});await upload;
 assert.equal((await CMS.one('entries',id))._deleted,true);assert.equal((await CMS.all('mutations')).length,1);
 c.remote.rpc=(name,input)=>{args=input;return query(Promise.resolve({data:{status:'accepted',version:2,entry:{...row(2),deleted_at:record().date}},error:null}))};
 await CMS.upload(2);assert.equal(args.p_delete,true);assert.equal(args.p_expected_version,1);
 assert.equal((await CMS.all('mutations')).length,0);assert.equal((await CMS.one('entries',id))._deleted,true);
});
test('lost response retains exact attempted mutation and retries same ID/version after reload',async()=>{
 const {CMS,c,openDB,state}=await harness();await CMS.queueSave(record());let first;
 c.remote={rpc:(name,input)=>{first=input;return query(Promise.reject(Error('response lost')))}};
 await assert.rejects(()=>CMS.upload(1),/response lost/);const saved=await CMS.one('mutations',1);assert.equal(saved.attempted,true);
 c.db.close();c.db=await openDB(A);state.db=c.db;
 c.remote.rpc=(name,input)=>{assert.equal(input.p_mutation_id,first.p_mutation_id);assert.equal(input.p_expected_version,first.p_expected_version);return query(Promise.resolve({data:{status:'duplicate',version:1}}))};
 await CMS.upload(1);assert.equal((await CMS.all('mutations')).length,0);
});
test('edit during upload survives acknowledgment and gets authoritative base version',async()=>{
 const {CMS,c}=await harness();await CMS.queueSave(record());const d=deferred();c.remote={rpc:()=>query(d.promise)};
 const upload=CMS.upload(1);await new Promise(r=>setImmediate(r));const local=await CMS.one('entries',id);await CMS.queueSave({...local,systolic:135});
 d.resolve({data:{status:'accepted',version:1,entry:row()}});await upload;
 const current=await CMS.one('entries',id);assert.equal(current.systolic,135);assert.equal(current._serverVersion,1);assert.equal((await CMS.all('mutations')).length,1);
});
test('pull checks pending state inside transaction and never overwrites an offline edit',async()=>{
 const {CMS,c}=await harness();let calls=0;const d=deferred();
 c.remote={from:()=>{const q={select:()=>q,order:()=>q,limit:()=>q,gt:()=>q,abortSignal:()=>++calls===1?d.promise:Promise.resolve({data:[]})};return q}};
 const pull=CMS.pull();await new Promise(r=>setImmediate(r));await CMS.queueSave({...record(),systolic:140});d.resolve({data:[row(2)]});await pull;
 assert.equal((await CMS.one('entries',id)).systolic,140);assert.equal(calls,2);
});
test('response for A is rejected after account transition, leaving B untouched',async()=>{
 const {CMS,c,openDB,state}=await harness();await CMS.queueSave(record());const d=deferred();c.remote={rpc:()=>query(d.promise)};
 const upload=CMS.upload(1);await new Promise(r=>setImmediate(r));
 const b={db:await openDB(B),user:{id:B},generation:2};CMS.generation=2;CMS.context=b;CMS.user=b.user;state.db=b.db;
 d.resolve({data:{status:'accepted',version:1,entry:row()}});await assert.rejects(()=>upload,/Account changed/);
 assert.equal((await CMS.all('entries')).length,0);assert.equal((await CMS.all('mutations')).length,0);
});
test('conflict retains local and server data; reviewed choice archives both and queues CAS',async()=>{
 const {CMS,c}=await harness();await CMS.queueSave(record());c.remote={rpc:()=>query(Promise.resolve({data:{status:'conflict',server_version:3,server_entry:row(3)}}))};
 await CMS.upload(1);assert.equal((await CMS.all('conflicts')).length,1);assert.equal((await CMS.all('mutations')).length,1);
 await assert.rejects(()=>CMS.queueSave(record()),/Resolve/);
 await CMS.resolve(id,'local');assert.equal((await CMS.all('conflicts')).length,0);
 assert.equal((await CMS.all('history'))[0].reason,'conflict-resolution');assert.equal((await CMS.one('entries',id))._serverVersion,3);
});
test('remote timestamps preserve timezone and fractional-second instant',async()=>{
 const {CMS}=await harness();assert.equal(CMS.remoteRow(row()).date,record().date);
});
test('invalid imported IDs, inherited categories, dates, and numeric fields are rejected',async()=>{
 const {CMS}=await harness();for(const value of [{...record(),id:"');alert(1)//"},{...record(),type:'toString'},{...record(),date:'not a date'},{...record(),date:0},{...record(),type:['vitals']},{...record(),systolic:'<img>'}])assert.throws(()=>CMS.validate(value));
});
test('upgrade from v1 preserves entries, pending mutation identity and conflict candidates',async()=>{
 const factory=new IDBFactory();await new Promise((resolve,reject)=>{const r=factory.open('cmshealth-m1-'+A,1);r.onupgradeneeded=()=>{for(const name of ['entries','outbox','conflicts'])r.result.createObjectStore(name,{keyPath:'id'})};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['entries','outbox','conflicts'],'readwrite');tx.objectStore('entries').put(record());tx.objectStore('outbox').put({id,mutationId:A,baseVersion:0,record:record(),deleted:false});tx.objectStore('conflicts').put({id,local:record(),server:row(2)});tx.oncomplete=()=>{db.close();resolve()}}});
 const {CMS}=await harness(factory);assert.equal((await CMS.all('entries')).length,1);assert.equal((await CMS.all('outbox')).length,0);
 const [op]=await CMS.all('mutations');assert.equal(op.mutationId,A);assert.equal(op.attempted,true);assert.equal((await CMS.all('conflicts')).length,1);
});
test('password recovery validates confirmation and calls authenticated updateUser',async()=>{
 const {CMS,sandbox}=await harness();let password;
 CMS.client={auth:{updateUser:async input=>{password=input.password;return {error:null}}}};
 sandbox.document.getElementById('newPassword').value='test-only-password';sandbox.document.getElementById('confirmPassword').value='mismatch';
 await CMS.updatePassword({preventDefault(){}});assert.equal(password,undefined);assert.match(CMS.error,/match/);
 sandbox.document.getElementById('confirmPassword').value='test-only-password';CMS.recovery=true;await CMS.updatePassword({preventDefault(){}});
 assert.equal(password,'test-only-password');assert.equal(CMS.recovery,false);
});
test('sign-out error is visible and does not clear account cache',async()=>{
 const {CMS,c}=await harness();CMS.client={auth:{signOut:async options=>{assert.equal(options.scope,'local');return {error:Error('Unable to revoke session')}}}};
 await CMS.signOut();assert.equal(CMS.context,c);assert.match(CMS.error,/Unable to revoke/);
});
test('malformed legacy import fails validation before any local record is written',async()=>{
 const {CMS,ctx,sandbox}=await harness();let message; sandbox.alert=x=>{message=x};
 const importJSON=vm.runInContext('importJSON',ctx);
 await importJSON({size:100,text:async()=>JSON.stringify({app:'CMsHealth',schemaVersion:1,entries:[record(),{...record(),id:B,date:'bad'}]})});
 assert.match(message,/Invalid/);assert.equal((await CMS.all('entries')).length,0);assert.equal((await CMS.all('mutations')).length,0);
});
test('import account is pinned before asynchronous file reading',async()=>{
 const {CMS,ctx,openDB,state,sandbox}=await harness();let message;sandbox.alert=x=>{message=x};const d=deferred();
 const importing=vm.runInContext('importJSON',ctx)({size:100,text:()=>d.promise});
 const b={db:await openDB(B),user:{id:B},generation:2};CMS.generation=2;CMS.context=b;CMS.user=b.user;state.db=b.db;
 d.resolve(JSON.stringify({app:'CMsHealth',schemaVersion:1,entries:[record()]}));await importing;
 assert.match(message,/Account changed/);assert.equal((await CMS.all('entries')).length,0);
});
