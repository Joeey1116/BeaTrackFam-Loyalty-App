import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Logo } from '../components/Logo';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ensureProfile } from '../lib/loyalty';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const configured = isSupabaseConfigured();

  const handleSignIn = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase!.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
      } else {
        // Make sure the loyalty profile exists (covers users who confirmed via email).
        try {
          if (data.user) await ensureProfile(data.user.id, email.trim());
        } catch {
          // Non-fatal: the home tab will show a signed-in state regardless.
        }
        router.replace('/(tabs)');
      }
    } catch {
      setError('Could not sign you in. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Logo size={72} />
        <Text style={styles.headline}>WELCOME BACK.</Text>
        <Text style={styles.subline}>Your points missed you.</Text>
      </View>

      {!configured && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoTitle}>DEMO MODE</Text>
          <Text style={styles.demoText}>
            I have not connected the points database yet. You can look around with sample points —
            nothing here is real or saved.
          </Text>
          <TouchableOpacity
            style={styles.demoButton}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Text style={styles.demoButtonText}>CONTINUE IN DEMO</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.label}>EMAIL</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor="#555555"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={configured}
      />
      <Text style={styles.label}>PASSWORD</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        placeholderTextColor="#555555"
        secureTextEntry
        editable={configured}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.primary, (!configured || loading) && styles.primaryDisabled]}
        onPress={handleSignIn}
        disabled={!configured || loading}
        activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>SIGN IN</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/sign-up')} style={styles.switch}>
        <Text style={styles.switchText}>New here? Join the Fam</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 32, marginBottom: 28 },
  headline: { color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: 1, marginTop: 18 },
  subline: { color: '#888888', fontSize: 15, fontStyle: 'italic', marginTop: 8 },
  demoBanner: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    marginBottom: 24,
    alignItems: 'center',
  },
  demoTitle: { color: '#ffffff', fontSize: 13, fontWeight: '800', letterSpacing: 3, marginBottom: 8 },
  demoText: { color: '#999999', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 14 },
  demoButton: { backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  demoButtonText: { color: '#000000', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  label: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 8, marginTop: 8 },
  input: {
    backgroundColor: '#111111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  error: { color: '#ff8888', fontSize: 14, marginTop: 8, marginBottom: 4 },
  primary: { backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginTop: 16 },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  switch: { alignItems: 'center', marginTop: 18 },
  switchText: { color: '#aaaaaa', fontSize: 14, fontWeight: '600' },
});
