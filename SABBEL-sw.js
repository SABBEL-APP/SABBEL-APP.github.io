const CACHE_NAME = "sabbel-v1";

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

// A push sender must deliver a Web Push message to this browser subscription.
self.addEventListener("push", event => {
  let message = {};
  try {
    if (event.data) message = event.data.json();
  } catch (error) {
    // Show a generic notification when a sender delivers invalid JSON.
  }
  if (!message || typeof message !== "object") message = {};

  const scope = self.registration.scope;
  let target = new URL("./", scope);
  try {
    const candidate = new URL(message.url || "./", scope);
    if (candidate.origin === self.location.origin && candidate.href.startsWith(scope)) {
      target = candidate;
    }
  } catch (error) {
    // Keep the app's start URL for invalid links.
  }

  event.waitUntil(
    self.registration.showNotification("📬 Neue Privatnachricht", {
      body: typeof message.body === "string" && message.body.trim()
        ? message.body.trim()
        : "Du hast eine neue Privatnachricht in SABBEL.",
      icon: new URL("icon-192.png", scope).href,
      tag: message.id == null ? "sabbel-private" : "sabbel-private-" + String(message.id),
      data: { url: target.href }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification.data?.url || self.registration.scope;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) {
      if (existing.navigate) await existing.navigate(url);
      return existing.focus();
    }
    return self.clients.openWindow(url);
  })());
});
