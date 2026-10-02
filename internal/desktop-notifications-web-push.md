# Desktop notifications: Web Push (parked)

## Today

Settings → Notifications → Desktop notifications. When a new inbox notification arrives and Eva is open but not focused, `NotificationToastStream` raises an OS pop-up (`apps/web/src/lib/components/notifications/desktopNotifications.ts`). Opt-in is per device (localStorage + browser permission).

Limit: an Eva window or tab must be open. Close every Eva window and nothing arrives.

## Option 2: Web Push (works with Eva closed)

The server pushes to the browser directly, so the pop-up arrives with no Eva window open. The browser process must still be running (Chrome keeps a background process on macOS; on Windows it needs "Continue running background apps"). iOS only delivers to a home-screen-installed Eva.

### Pieces

1. **VAPID keys** — generate once (`npx web-push generate-vapid-keys`). Public key ships to the client (`VITE_VAPID_PUBLIC_KEY`); private key is a Convex env var.
2. **Service worker** — `apps/web/public/sw.js`, registered at boot. Handles `push` (call `showNotification` with the payload, `tag` = notification id) and `notificationclick` (focus an open Eva client or `clients.openWindow(href)`).
3. **Subscribe** — the existing Desktop notifications switch calls `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` and saves the subscription.
4. **Convex table** — `pushSubscriptions { userId, endpoint, p256dh, auth, userAgent, createdAt }`, indexed by user and by endpoint. Mutations to upsert/delete.
5. **Send** — where `notifications` rows are inserted (see `packages/backend/convex/notifications.ts`), schedule a `"use node"` action that uses the `web-push` package to send to each of the user's subscriptions. Skip `urgency: "low"` and unrouted mentions, same as the toast stream.
6. **Cleanup** — delete a subscription when a send returns 404/410.

### Watch for

- Double pop-ups: once push exists, drop the in-tab `showDesktopNotification` call (or rely on the shared `tag` to collapse them).
- The service worker must not cache app assets, or it fights the stale-deploy reload logic.
- New dependency: `web-push` (backend only).

Rough size: a few days, including testing on macOS and Windows.
