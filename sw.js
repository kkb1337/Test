const APP_VERSION='1.7.80';
const CACHE_NAME='ftracker-v1.7.80-clean-architecture';
const ASSETS=[
'./?v='+APP_VERSION,
'./index.html?v='+APP_VERSION,
'./manifest.json?v='+APP_VERSION,
'./styles.css?v='+APP_VERSION,
'./app.js?v='+APP_VERSION,
'./icon-192.png?v='+APP_VERSION,
'./icon-512.png?v='+APP_VERSION
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET') return;
 e.respondWith(fetch(e.request).then(res=>{const copy=res.clone(); caches.open(CACHE_NAME).then(c=>c.put(e.request,copy)); return res;}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./index.html'))));
});
