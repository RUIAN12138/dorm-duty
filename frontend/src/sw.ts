/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { createHandlerBoundToURL } from "workbox-precaching";
declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
const base = new URL(self.registration.scope).pathname;
const basePattern = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${base}index.html`), {
    denylist: [
      new RegExp(
        `^${basePattern}(email|guest|chores|auth|dorms|duties|notifications|push|health|docs|openapi\\.json)(/|\\?|$)`,
      ),
    ],
  }),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "轮到 · 值日提醒", {
      body: data.body || "查看宿舍任务",
      icon: `${base}icon-192.png`,
      badge: `${base}icon-192.png`,
      tag: data.tag || "dorm-duty",
      data: { url: data.url || base },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || base,
    self.location.origin,
  );
  if (url.origin !== self.location.origin) return;
  if (url.pathname === base.slice(0, -1)) url.pathname = base;
  else if (!url.pathname.startsWith(base))
    url.pathname = `${base}${url.pathname.replace(/^\//, "")}`;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        const clientURL = new URL(client.url);
        if (
          clientURL.origin === self.location.origin &&
          clientURL.pathname.startsWith(base)
        ) {
          await (client as WindowClient).navigate(url.href);
          return (client as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});
