import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Logo } from '../components/Logo';
import { getSessionUserId } from '../lib/loyalty';

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
