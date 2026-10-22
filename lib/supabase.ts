import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

let client: SupabaseClient | null = null;

if (url && anonKey) {
  try {
    client = createClient(url, anonKey, {
      auth: {
        // React Native has no localStorage: without an explicit storage
        // adapter the session lives only in memory and is lost every time
        // the app closes (user lands back on onboarding after a restart).
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE, explicitly. @supabase/auth-js DEFAULTS TO 'implicit' —
        // builds 16/17 assumed PKCE was the v2 default and never opted in,
        // so signup-confirmation emails delivered the session as URL
        // fragment tokens (#access_token=...), which never survived the
        // Gmail -> browser -> "Open in app?" handoff into the app: the
        // deep-link handler ended up with no usable credentials, no
        // session was ever created, and nothing was persisted (the
        // "doesn't stay logged in" bug). With PKCE, signUp/resend/
        // resetPasswordForEmail store a code verifier in AsyncStorage
        // and the email links come back with ?code= in the query string,
        // which the handlers exchange via exchangeCodeForSession — the
        // documented Expo/React Native pattern.
        flowType: 'pkce',
      },
    });
  } catch {
    client = null;
  }
}

/**
 * Supabase client, or null when credentials are missing/invalid.
 * When null the app runs in demo mode (local in-memory data).
 * Never throws at import time.
 */
export const supabase: SupabaseClient | null = client;

export function isSupabaseConfigured(): boolean {
  return client !== null;
}
