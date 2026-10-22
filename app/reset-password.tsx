import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Logo } from '../components/Logo';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Status = 'checking' | 'ready' | 'invalid';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const configured = isSupabaseConfigured();
  // The recovery session is established by AuthProvider (it processes
  // the reset deep link before resolving auth status), so this screen
  // just reads the shared state — no getSession() polling. 'checking'
  // while the provider restores, 'ready' with a session, 'invalid'
  // once auth has resolved with no session.
  const { status: authStatus, session } = useAuth();
  const status: Status = !configured
    ? 'invalid'
    : session
      ? 'ready'
      : authStatus === 'loading'
        ? 'checking'
        : 'invalid';

  const handleSave = async () => {
    setMessage('');
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase!.auth.updateUser({ password });
      if (updateError) {
        setMessage(updateError.message);
        return;
      }
      router.replace('/(tabs)');
    } catch {
      setMessage('Could not update your password. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Logo size={72} />
        <Text style={styles.headline}>NEW PASSWORD.</Text>
        <Text style={styles.subline}>Choose something you'll remember this time.</Text>
      </View>

      {status === 'checking' && (
        <View style={styles.center}>
          <ActivityIndicator color="#ffffff" size="large" />
          <Text style={styles.checkingText}>Verifying your reset link…</Text>
        </View>
      )}

      {status === 'invalid' && (
        <View style={styles.center}>
          <Text style={styles.invalidTitle}>LINK EXPIRED</Text>
          <Text style={styles.invalidText}>
            This reset link is invalid or expired. Request a new one from the sign-in screen.
          </Text>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => router.replace('/sign-in')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryText}>BACK TO SIGN IN</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'ready' && (
        <>
          <Text style={styles.label}>NEW PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor="#555555"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.label}>CONFIRM PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat your new password"
            placeholderTextColor="#555555"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          {message ? <Text style={styles.error}>{message}</Text> : null}

          <TouchableOpacity
            style={[styles.primary, saving && styles.primaryDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryText}>SAVE NEW PASSWORD</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 32, marginBottom: 28 },
  headline: { color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: 1, marginTop: 18 },
  subline: { color: '#888888', fontSize: 15, fontStyle: 'italic', marginTop: 8 },
  center: { alignItems: 'center', marginTop: 40 },
  checkingText: { color: '#888888', fontSize: 14, marginTop: 16 },
  invalidTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 3, marginBottom: 12 },
  invalidText: { color: '#999999', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 12 },
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
  primary: { backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginTop: 16, paddingHorizontal: 32 },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
});
