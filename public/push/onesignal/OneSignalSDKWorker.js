// OneSignal's push worker, scoped to /push/onesignal/ so it never replaces
// Chapter's own service worker (sw.js) at the site root.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
