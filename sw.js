// Network-first app shell. Avoid serving stale HTML after GitHub Pages updates.
const CACHE = 'recurring-charges-v12-device-push';
const APP_ASSETS = ['./style.css?v=12-device-push', './app.js?v=12-device-push', './supabase-config.js?v=12-device-push', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(fetch(event.request, {cache:'no-store'}));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request,copy)).catch(()=>{}); }
    return response;
  }).catch(() => caches.match(event.request)));
});

self.addEventListener('push',event=>{
 let message={title:'Recurring charge reminder',body:'A payment is coming up.',url:'./'};
 try{if(event.data)message={...message,...event.data.json()}}catch{}
 event.waitUntil(self.registration.showNotification(String(message.title).slice(0,100),{
  body:String(message.body).slice(0,250),icon:'./icons/icon-192.png',
  badge:'./icons/icon-192.png',data:{url:self.registration.scope}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  const existing=windows.find(w=>w.url.startsWith(self.registration.scope));
  return existing?existing.focus():clients.openWindow(self.registration.scope);
 }));
});
