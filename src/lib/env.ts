// Build-time configuration. Only public values belong here: anything in a
// VITE_ variable ships to every browser.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

export type AiProviderName = 'anthropic' | 'groq' | 'openrouter' | null;

function aiProviderOf(v: string | undefined): AiProviderName {
  const p = (v ?? '').trim().toLowerCase();
  return p === 'anthropic' || p === 'groq' || p === 'openrouter' ? p : null;
}

export const env = {
  supabaseUrl: url.replace(/\/$/, ''),
  supabaseAnonKey: anonKey,
  isConfigured: /^https:\/\/.+/.test(url) && anonKey.length > 20,
  /** RevenueCat Web Billing public API key; Chapter Plus is offered only when set */
  revenuecatKey: ((import.meta.env.VITE_REVENUECAT_API_KEY as string | undefined) ?? '').trim(),
  /** OneSignal Web app id (public); review reminders are offered only when set */
  onesignalAppId: ((import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined) ?? '').trim(),
  revenuecatEntitlement: ((import.meta.env.VITE_REVENUECAT_ENTITLEMENT as string | undefined) ?? 'plus').trim() || 'plus',
  /**
   * The AI provider the Edge Functions use (anthropic | groq | openrouter),
   * named in the privacy policy. Keep it in step with the AI_PROVIDER secret;
   * empty means AI features are off.
   */
  aiProvider: aiProviderOf(import.meta.env.VITE_AI_PROVIDER as string | undefined),
  /** development | preview | production */
  appEnv: ((import.meta.env.VITE_APP_ENV as string | undefined) ?? (import.meta.env.PROD ? 'production' : 'development')),
} as const;

// A service-role key must never reach the browser. Its JWT payload names the
// role, so refuse to start rather than run with full database access exposed.
if (anonKey) {
  try {
    const payload = JSON.parse(atob(anonKey.split('.')[1] ?? ''));
    if (payload?.role === 'service_role') {
      throw new Error('VITE_SUPABASE_ANON_KEY is a service_role key. Use the anon key.');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('service_role')) throw e;
  }
}
