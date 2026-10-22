import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Logo } from '../components/Logo';
import { useAuth } from '../lib/auth';
import { takePasswordResetPending } from '../lib/passwordReset';
import { takeEmailConfirmationFailed } from '../lib/emailConfirmed';

/**
 * Auth gate: branded splash while AuthProvider restores the session,
 * then route on the resolved state — signed-in users to the tabs,
 * everyone else to onboarding. The gate no longer polls getSession():
 * the provider's restore already includes any cold-start deep-link
 * exchange, so when status resolves, the answer is final. Sign back in
 * via the provider's transitions if a session appears later.
 */
export default function AuthGate() {
  const { status } = useAuth();
  const [minSplashDone, setMinSplashDone] = useState(false);

  // Let the branding breathe for a moment.
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status === 'loading' || !minSplashDone) return;
    // A password-reset deep link launched the app — the recovery session
    // must land on the reset screen, not bounce into the tabs.
    if (takePasswordResetPending()) {
      router.replace('/reset-password');
      return;
    }
    if (status === 'signedIn') {
      router.replace('/(tabs)');
      return;
    }
    // A confirmation link was opened but established no session (used or
    // broken link). The account is usually confirmed server-side, so
    // sign-in is the useful next step — not onboarding.
    if (takeEmailConfirmationFailed()) {
      router.replace('/sign-in');
      return;
    }
    router.replace('/onboarding');
  }, [status, minSplashDone]);

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
