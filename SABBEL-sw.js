const CACHE_NAME = "sabbel-v4-voice";
const NAVIGATION_TIMEOUT_MS = 4000;
const BADGE_CACHE = "sabbel-badge-v1";
const BADGE_KEY = new URL(
  "__sabbel_badge_count__",
  self.registration.scope
).href;

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith("sabbel-v") &&
          key !== CACHE_NAME &&
          key !== BADGE_CACHE
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const request = event.request;
  const sameOrigin =
    new URL(request.url).origin === self.location.origin;

  const networkPromise = fetch(request, { cache: "no-store" });

  if (sameOrigin) {
    event.waitUntil(
      networkPromise
        .then(async response => {
          if (!response || !response.ok) return;
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        })
        .catch(() => {})
    );
  }

  const networkResponse = networkPromise.then(response => response);

  const fallbackFromCache = async error => {
    const cached = await caches.match(
      request,
      request.mode === "navigate"
        ? { ignoreSearch: true }
        : undefined
    );

    if (cached) return cached;
    throw error;
  };

  if (request.mode === "navigate") {
    const cachedAfterTimeout = new Promise(resolve => {
      setTimeout(async () => {
        try {
          resolve(
            await caches.match(request, { ignoreSearch: true })
          );
        } catch (error) {
          resolve(null);
        }
      }, NAVIGATION_TIMEOUT_MS);
    });

    event.respondWith(
      Promise.race([networkResponse, cachedAfterTimeout])
        .then(response => response || networkResponse)
        .catch(fallbackFromCache)
    );

    return;
  }

  event.respondWith(
    networkResponse.catch(fallbackFromCache)
  );
});

async function getBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const response = await cache.match(BADGE_KEY);

    if (!response) return 0;

    const value = Number(await response.text());

    return Number.isFinite(value) && value >= 0
      ? value
      : 0;
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
    if (
      safeCount > 0 &&
      self.registration.setAppBadge
    ) {
      await self.registration.setAppBadge(safeCount);
    } else if (
      safeCount === 0 &&
      self.registration.clearAppBadge
    ) {
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

    if (
      !message ||
      typeof message !== "object"
    ) {
      message = {};
    }

    const scope = self.registration.scope;
    let target = new URL("./", scope);

    try {
      const candidate = new URL(
        message.url || "./",
        scope
      );

      if (
        candidate.origin === self.location.origin &&
        candidate.href.startsWith(scope)
      ) {
        target = candidate;
      }
    } catch (error) {}

    const sender =
      (
        typeof message.sender_name === "string" &&
        message.sender_name.trim()
      ) ||
      (
        typeof message.sender === "string" &&
        message.sender.trim()
      ) ||
      (
        typeof message.name === "string" &&
        message.name.trim()
      ) ||
      "Jemand";

    const voiceText = String(
      message.message ||
      message.body ||
      ""
    ).trim();

    const isVoice =
      message.notification_type === "voice" ||
      String(
        message.file_type || ""
      ).toLowerCase().startsWith("audio/") ||
      /^(?:Datei:\s*)?Sprachnachricht(?:\.webm)?$/i
        .test(voiceText);

    /*
     * ACCOUNT-WARNUNG
     *
     * Dieser Zweig ist vollständig von den
     * normalen Text- und Sprach-Pushs getrennt.
     */
    const isAccountWarning =
      message.notification_type ===
      "account_warning";

    const body = isAccountWarning
      ? (
          (
            typeof message.message === "string" &&
            message.message.trim()
          ) ||
          (
            typeof message.body === "string" &&
            message.body.trim()
          ) ||
          "Du warst seit mehr als 30 Tagen nicht mehr online."
        )
      : isVoice
        ? "Sprachnachricht"
        : (
            (
              typeof message.message === "string" &&
              message.message.trim()
            ) ||
            (
              typeof message.body === "string" &&
              message.body.trim()
            ) ||
            "Du hast eine neue Privatnachricht."
          );

    /*
     * WICHTIG:
     *
     * Text-Push:
     * brief-512.png
     *
     * Sprach-Push:
     * megafon-512.png
     *
     * Account-Warnung:
     * warnzeichen-512-transparent.png
     *
     * badge-192.png bleibt hiervon vollständig
     * getrennt und wird weiter unten unverändert
     * für die Android-Statusleiste verwendet.
     */
    const notificationIcon =
      isAccountWarning
        ? "warnzeichen-512-transparent.png"
        : isVoice
          ? "megafon-512.png"
          : "brief-512.png";

    const uniqueId =
      message.id != null
        ? String(message.id)
        : (
            self.crypto?.randomUUID?.() ||
            (
              Date.now() +
              "-" +
              Math.random()
                .toString(36)
                .slice(2)
            )
          );

    const count = await getBadgeCount();
    await setBadgeCount(count + 1);

    /*
     * Nur der sichtbare Titel wird bei der
     * Account-Warnung ausgetauscht.
     *
     * Normale Pushs behalten:
     * "[Name] hat dich angesabbelt:"
     */
    const notificationTitle =
      isAccountWarning
        ? "Achtung! Dein Account wird automatisch gelöscht!"
        : sender + " hat dich angesabbelt:";

    await self.registration.showNotification(
      notificationTitle,
      {
        body,

        /*
         * Großes Push-Icon.
         */
        icon: new URL(
          notificationIcon,
          scope
        ).href,

        /*
         * NICHT VERÄNDERN:
         * bestehendes Android-/Statusleisten-Badge.
         */
        badge: new URL(
          "badge-192.png",
          scope
        ).href,

        /*
         * Eigener Tag nur für die Accountwarnung.
         * Normale Privatnachrichten behalten
         * ihre bisherige Tag-Logik.
         */
        tag: isAccountWarning
          ? "sabbel-account-warning"
          : "sabbel-private-" + uniqueId,

        renotify: true,

        data: {
          url: target.href
        }
      }
    );
  })());
});

self.addEventListener(
  "notificationclick",
  event => {
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
  }
);
