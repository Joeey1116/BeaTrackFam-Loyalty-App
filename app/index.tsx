import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Logo } from '../components/Logo';
import { getSessionUserId } from '../lib/loyalty';
import { takePasswordResetPending } from '../lib/passwordReset';
import { isEmailConfirmedPending, takeEmailConfirmedPending } from '../lib/emailConfirmed';

/**
 * Auth gate: brief branded splash, then route to the tabs for signed-in
 * users or onboarding for everyone else. Never crashes when Supabase is
 * unconfigured — it just sends you to onboarding (demo mode).
 */
export default function AuthGate() {
  useEffect(() => {
    let cancelled = false;
    const go = async () => {
      // Let the branding breathe for a moment.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (cancelled) return;
      // A password-reset deep link launched the app — the recovery session
      // must land on the reset screen, not bounce into the tabs.
      if (takePasswordResetPending()) {
        router.replace('/reset-password');
        return;
      }
      // A signup-confirmation deep link launched the app — the layout is
      // exchanging the confirmation code for a session right now. Wait for
      // it (bounded) instead of bouncing a signed-in user to onboarding.
      if (isEmailConfirmedPending()) {
        for (let i = 0; i < 10; i++) {
          let id: string | null = null;
          try {
            id = await getSessionUserId();
          } catch {
            id = null;
          }
          if (id || cancelled) break;
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
        if (cancelled) return;
        // The exchange never produced a session (expired/invalid link) —
        // drop the stale flag so a later normal sign-in doesn't show it.
        let confirmedId: string | null = null;
        try {
          confirmedId = await getSessionUserId();
        } catch {
          confirmedId = null;
        }
        if (!confirmedId) takeEmailConfirmedPending();
      }
      let userId: string | null = null;
      try {
        userId = await getSessionUserId();
      } catch {
        userId = null;
      }
      if (cancelled) return;
      router.replace(userId ? '/(tabs)' : '/onboarding');
    };
    go();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.wrap}>
      <Logo size={110} />
      <Text style={styles.title}>BEATRACKFAM</Text>
      <Text style={styles.subtitle}>REWARDS</Text>
      <Text style={styles.tagline}>Loyalty above all.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '800', letterSpacing: 6, marginTop: 24 },
  subtitle: { color: '#888888', fontSize: 14, fontWeight: '800', letterSpacing: 10, marginTop: 6 },
  tagline: { color: '#555555', fontSize: 14, marginTop: 16, fontStyle: 'italic' },
});
