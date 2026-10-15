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
