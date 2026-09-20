const CACHE_NAME = "sabbel-v1";
const BADGE_CACHE = "sabbel-badge-v1";
const BADGE_KEY = new URL("__sabbel_badge_count__", self.registration.scope).href;

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

async function getBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const response = await cache.match(BADGE_KEY);

    if (!response) return 0;

    const value = Number(await response.text());
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch (error) {
    return 0;
  }
}

async function setBadgeCount(count) {
  const safeCount = Math.max(0, Number(count) || 0);

  try {
    const cache = await caches.open(BADGE_CACHE);

    await cache.put(
      BADGE_KEY,
      new Response(String(safeCount), {
        headers: {
          "Content-Type": "text/plain"
        }
      })
    );
  } catch (error) {}

  try {
    if (safeCount > 0 && self.registration.setAppBadge) {
      await self.registration.setAppBadge(safeCount);
    } else if (safeCount === 0 && self.registration.clearAppBadge) {
      await self.registration.clearAppBadge();
    }
  } catch (error) {}

  return safeCount;
}

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let message = {};

    try {
      if (event.data) {
        message = event.data.json();
      }
    } catch (error) {}

    if (!message || typeof message !== "object") {
      message = {};
    }

    const scope = self.registration.scope;

    let target = new URL("./", scope);

    try {
      const candidate = new URL(message.url || "./", scope);

      if (
        candidate.origin === self.location.origin &&
        candidate.href.startsWith(scope)
      ) {
        target = candidate;
      }
    } catch (error) {}

    const sender =
      (typeof message.sender_name === "string" &&
        message.sender_name.trim()) ||
      (typeof message.sender === "string" &&
        message.sender.trim()) ||
      (typeof message.name === "string" &&
        message.name.trim()) ||
      "Jemand";

    const body =
      (typeof message.message === "string" &&
        message.message.trim()) ||
      (typeof message.body === "string" &&
        message.body.trim()) ||
      "Du hast eine neue Privatnachricht.";

    const uniqueId =
      message.id != null
        ? String(message.id)
        : (
            self.crypto?.randomUUID?.() ||
            (
              Date.now() +
              "-" +
              Math.random().toString(36).slice(2)
            )
          );

    const count = await getBadgeCount();

    await setBadgeCount(count + 1);

    await self.registration.showNotification(
      sender + " hat dich angesabbelt:",
      {
        body: body,
        icon: new URL("icon-192.png", scope).href,
        tag: "sabbel-private-" + uniqueId,
        renotify: true,
        data: {
          url: target.href
        }
      }
    );
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil((async () => {
    const url =
      event.notification.data?.url ||
      self.registration.scope;

    const windows =
      await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

    const existing =
      windows.find(client =>
        client.url.startsWith(
          self.registration.scope
        )
      );

    if (existing) {
      if (existing.navigate) {
        await existing.navigate(url);
      }

      return existing.focus();
    }

    return self.clients.openWindow(url);
  })());
});
