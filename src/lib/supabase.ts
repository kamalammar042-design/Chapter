import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// PKCE: email links carry a one-time code exchanged on our own domain,
// instead of tokens in the URL fragment.
export const supabase: SupabaseClient = createClient(
  env.isConfigured ? env.supabaseUrl : 'https://not-configured.invalid',
  env.isConfigured ? env.supabaseAnonKey : 'not-configured',
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'chapter.auth',
    },
  },
);
