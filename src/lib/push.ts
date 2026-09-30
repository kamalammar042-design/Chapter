// Web push for review reminders, through OneSignal's Web SDK (v16).
//
// Nothing loads until a student turns reminders on: the SDK script is
// injected on demand, and its service worker lives under /push/onesignal/
// so it never replaces Chapter's own offline worker at the site root.
// The server only ever learns this browser's OneSignal subscription id.
import { env } from './env';

interface PushSubscriptionApi {
  id: string | null | undefined;
  optedIn: boolean | undefined;
  optIn(): Promise<void>;
  optOut(): Promise<void>;
}

interface OneSignalApi {
  init(options: Record<string, unknown>): Promise<void>;
  Notifications: { permission: boolean; isPushSupported(): boolean; requestPermission(): Promise<void> };
  User: { PushSubscription: PushSubscriptionApi };
}

declare global {
  interface Window { OneSignalDeferred?: Array<(os: OneSignalApi) => void | Promise<void>> }
}

const SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';

export const pushConfigured = env.onesignalAppId.length > 0;

export type PushProblem = 'unsupported' | 'ios_install' | 'denied' | 'failed';

export class PushError extends Error {
  constructor(readonly problem: PushProblem) {
    super(problem);
    this.name = 'PushError';
  }
}

/** Whether this browser can receive web push at all (without loading anything). */
export function pushSupport(): 'ok' | 'ios_install' | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported';
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'ios_install'; // iOS only allows push for Home Screen apps
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

let loading: Promise<OneSignalApi> | null = null;

function load(): Promise<OneSignalApi> {
  loading ??= new Promise<OneSignalApi>((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (os) => {
      try {
        await os.init({
          appId: env.onesignalAppId,
          serviceWorkerPath: 'push/onesignal/OneSignalSDKWorker.js',
          serviceWorkerParam: { scope: '/push/onesignal/' },
          notifyButton: { enable: false },
          autoResubscribe: true,
          allowLocalhostAsSecureOrigin: import.meta.env.DEV,
        });
        resolve(os);
      } catch (e) {
        reject(e);
      }
    });
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.defer = true;
    script.onerror = () => reject(new PushError('failed'));
    document.head.appendChild(script);
  }).catch((e) => {
    loading = null;
    throw e instanceof PushError ? e : new PushError('failed');
  });
  return loading;
}

async function subscriptionId(os: OneSignalApi, timeoutMs = 15_000): Promise<string> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const id = os.User.PushSubscription.id;
    if (id && os.User.PushSubscription.optedIn) return id;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new PushError('failed');
}

/**
 * Asks for notification permission (the browser prompt appears only the
 * first time) and returns this browser's subscription id.
 */
export async function enablePush(): Promise<string> {
  const support = pushSupport();
  if (support !== 'ok') throw new PushError(support);
  if (Notification.permission === 'denied') throw new PushError('denied');
  const os = await load();
  if (!os.Notifications.isPushSupported()) throw new PushError('unsupported');
  await os.User.PushSubscription.optIn();
  if (Notification.permission !== 'granted') throw new PushError('denied');
  return subscriptionId(os);
}

/** Stops push to this browser. Best effort: the server forgets the device regardless. */
export async function disablePush(): Promise<void> {
  if (!loading) return;
  try {
    const os = await loading;
    await os.User.PushSubscription.optOut();
  } catch {
    /* nothing to undo */
  }
}
