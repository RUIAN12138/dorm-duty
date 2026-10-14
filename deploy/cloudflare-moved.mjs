// Legacy entry only. No database binding is read or written after migration.
const destination = "https://8.148.190.114/dorm-duty/";
const routes = new Set(["/", "/water", "/calendar", "/login"]);
const notice = JSON.stringify({
  detail: {
    code: "site_moved",
    message: "网站已迁移，请打开新的服务器入口。",
    url: destination,
  },
});
const movedSW = `self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await self.clients.claim();
  const windows=await self.clients.matchAll({type:'window'});
  for(const client of windows) client.postMessage({type:'SITE_MOVED',url:${JSON.stringify(destination)}});
})()));
self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate') event.respondWith(fetch(event.request));
});`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    };
    if (["GET", "HEAD"].includes(request.method)) {
      if (url.pathname === "/sw.js") {
        return new Response(request.method === "HEAD" ? null : movedSW, {
          headers: {
            ...headers,
            "Content-Type": "application/javascript; charset=utf-8",
            "Service-Worker-Allowed": "/",
          },
        });
      }
      if (routes.has(url.pathname) || url.pathname === "/index.html") {
        const route = ["/water", "/calendar"].includes(url.pathname)
          ? url.pathname.slice(1)
          : "";
        return new Response(null, {
          status: 302,
          headers: { ...headers, Location: destination + route },
        });
      }
    }
    return new Response(request.method === "HEAD" ? null : notice, {
      status: 410,
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  },
};
