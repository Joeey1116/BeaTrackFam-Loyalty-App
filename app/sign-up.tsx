import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Logo } from '../components/Logo';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { applyReferral, ensureProfile } from '../lib/loyalty';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const configured = isSupabaseConfigured();

  const handleSignUp = async () => {
    setError('');
    setInfo('');
    if (!email.trim() || !password) {
      setError('Enter an email and a password to join.');
      return;
    }
    if (password.length < 6) {
      setError('Password needs to be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase!.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      const user = data.user;
      if (!user) {
        setInfo('Check your email to confirm your account, then sign in.');
        return;
      }
      await ensureProfile(user.id, email.trim());
      if (referralCode.trim()) {
        const result = await applyReferral(user.id, referralCode);
        if (result.ok) {
          setInfo('Referral applied — you both got 50 pts. Welcome to the Fam!');
        } else {
          setInfo(`Account created. Referral note: ${result.error}`);
        }
      }
      router.replace('/(tabs)');
    } catch {
      setError('Could not create your account. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Logo size={72} />
        <Text style={styles.headline}>JOIN THE FAM.</Text>
        <Text style={styles.subline}>It takes ten seconds. The points last.</Text>
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
        placeholder="At least 6 characters"
        placeholderTextColor="#555555"
        secureTextEntry
        editable={configured}
      />
      <Text style={styles.label}>REFERRAL CODE (OPTIONAL)</Text>
      <TextInput
        style={styles.input}
        value={referralCode}
        onChangeText={setReferralCode}
        placeholder="e.g. FAM-ABC123"
        placeholderTextColor="#555555"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={configured}
      />
      <Text style={styles.hint}>Were you invited? Enter their code — you both get 50 pts.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      <TouchableOpacity
        style={[styles.primary, (!configured || loading) && styles.primaryDisabled]}
        onPress={handleSignUp}
        disabled={!configured || loading}
        activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>CREATE MY ACCOUNT</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/sign-in')} style={styles.switch}>
        <Text style={styles.switchText}>Already in the Fam? Sign in</Text>
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
    marginBottom: 4,
  },
  hint: { color: '#777777', fontSize: 13, marginBottom: 8 },
  error: { color: '#ff8888', fontSize: 14, marginTop: 8 },
  info: { color: '#aaddff', fontSize: 14, marginTop: 8, lineHeight: 20 },
  primary: { backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginTop: 16 },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  switch: { alignItems: 'center', marginTop: 18 },
  switchText: { color: '#aaaaaa', fontSize: 14, fontWeight: '600' },
});
