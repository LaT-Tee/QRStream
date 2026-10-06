/* Service Worker：首次在线打开后把整个应用缓存下来，之后完全离线可用
 *
 * 坑：Cloudflare Pages 会把 /index.html 308 重定向到 /。
 *   缓存里如果存的是"经过重定向的响应"，浏览器拒绝把它用于页面导航 → 离线打不开。
 *   所以：① 页面本体用 "./" 缓存；② 任何 redirected 响应都先拷贝成干净的新 Response 再入缓存。
 */
const VERSION = 'qrx4-5778126d00';
const FILES = ["./","manifest.webmanifest","icon.png"];
const SHELL = new URL('./', self.location).href;

async function clean(r) {
  if (!r.redirected) return r;
  const body = await r.blob();
  return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
}
async function fetchClean(url) {
  const r = await fetch(new Request(url, { cache: 'reload', redirect: 'follow' }));
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return clean(r);
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    for (const f of FILES) await c.put(new URL(f, self.location).href, await fetchClean(f));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
    for (const c of await self.clients.matchAll()) c.postMessage({ offlineReady: VERSION });
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isNav = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = isNav ? SHELL : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    // 在线时后台顺手更新（下次打开生效）
    const net = fetch(isNav ? SHELL : req).then(async r => {
      if (r.ok) { const c = await clean(r); await cache.put(key, c.clone()); return c; }
      return r;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('离线且未缓存，请先联网打开一次', { status: 503, headers: { 'content-type': 'text/plain;charset=utf-8' } });
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'ping') caches.open(VERSION).then(c => c.match(SHELL)).then(h => e.source && e.source.postMessage({ offlineReady: h ? VERSION : null }));
});
