import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A referral code typed on the sign-up form has nowhere to go when Supabase
 * requires email confirmation: signUp returns no session, so the code can't
 * be applied yet (RLS would reject the writes), and by the time the
 * confirmation deep link creates the session the form state is long gone.
 * Stash the code on-device at sign-up and apply it the first time a session
 * exists (confirmation deep-link handler / sign-in).
 */
const KEY = 'btr.pendingReferralCode';

export async function stashPendingReferral(code: string): Promise<void> {
  const clean = code.trim().toUpperCase();
  if (!clean) return;
  try {
    await AsyncStorage.setItem(KEY, clean);
  } catch {
    // Best effort — losing the stash just loses the referral bonus.
  }
}

export async function peekPendingReferral(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function clearPendingReferral(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Best effort.
  }
}
