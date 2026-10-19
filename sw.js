// App assets only: never cache Supabase requests, tokens, or health records.
const CACHE='cmshealth-m1-v3';
const FILES=['./','./index.html','./style.css','./app.js','./sync.js','./config.js','./vendor/supabase-2.49.4.min.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>/^cmshealth-m[01]-/.test(k)&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin)return;
 // Optional public config is cached only on successful response, for offline restart.
 if(url.pathname.endsWith('/config.local.js')){
  e.respondWith(fetch(e.request).then(async response=>{if(response.ok){const c=await caches.open(CACHE);await c.put(e.request,response.clone());}return response;}).catch(async()=>await caches.match(e.request)||new Response('// No local config cached',{headers:{'Content-Type':'application/javascript'}})));return;
 }
 if(!FILES.some(file=>new URL(file,self.registration.scope).pathname===url.pathname))return;
 e.respondWith(caches.match(e.request,{cacheName:CACHE}).then(cached=>cached||fetch(e.request)));
});
