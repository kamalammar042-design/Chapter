// Registers the service worker in production builds. The worker caches the
// app shell and static assets only; it never caches API responses, so no
// student data is stored by it.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* installability is a progressive enhancement */
    });
  });
}
