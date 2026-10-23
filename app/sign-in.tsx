import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Logo } from '../components/Logo';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { applyPendingReferral, ensureProfile } from '../lib/loyalty';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [forgotSending, setForgotSending] = useState(false);
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [showResend, setShowResend] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldownSecs(60);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldownSecs((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    const target = email.trim();
    if (!target || resending || cooldownSecs > 0) return;
    setResending(true);
    setError('');
    try {
      const { error: resendError } = await supabase!.auth.resend({
        type: 'signup',
        email: target,
        options: { emailRedirectTo: 'beatrackfamrewards://confirmed' },
      });
      if (resendError) {
        setError(resendError.message);
        return;
      }
      setInfo(`Confirmation email resent to ${target} — tap the link in the email and you'll come right back into the app. Check your inbox and spam folder.`);
      startCooldown();
    } catch {
      setError('Could not resend the email. Check your connection and try again.');
    } finally {
      setResending(false);
    }
  };

  const handleForgotPassword = async () => {
    const target = email.trim();
    setError('');
    setInfo('');
    setShowResend(false);
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setError('Enter your email above first so we know where to send the reset link.');
      return;
    }
    setForgotSending(true);
    try {
      const { error: resetError } = await supabase!.auth.resetPasswordForEmail(target, {
        redirectTo: 'beatrackfamrewards://reset-password',
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setInfo(`Password reset email sent to ${target} — check your inbox and spam folder.`);
    } catch {
      setError('Could not send the reset email. Check your connection and try again.');
    } finally {
      setForgotSending(false);
    }
  };

  const handleSignIn = async () => {    setError('');
    setInfo('');
    setShowResend(false);
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
        if (signInError.message.toLowerCase().includes('email not confirmed')) {
          setInfo(
            `Your email isn\u2019t confirmed yet. We sent the link to ${email.trim()} — tap it in your email and you'll come right back into the app. Check your inbox and spam folder, or resend it below.`
          );
          setShowResend(true);
        } else {
          setError(signInError.message);
        }
      } else {
        // Make sure the loyalty profile exists (covers users who confirmed via email).
        try {
          if (data.user) await ensureProfile(data.user.id, email.trim());
        } catch {
          // Non-fatal: the home tab will show a signed-in state regardless.
        }
        // Apply a referral code stashed at sign-up if the confirmation deep
        // link never ran on this device (e.g. confirmed on another device).
        try {
          if (data.user) await applyPendingReferral(data.user.id);
        } catch {
          // Non-fatal: the stash survives for a later sign-in.
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

      <TouchableOpacity
        onPress={handleForgotPassword}
        disabled={!configured || forgotSending}
        style={styles.forgot}
        activeOpacity={0.8}
      >
        {forgotSending ? (
          <ActivityIndicator color="#aaaaaa" size="small" />
        ) : (
          <Text style={styles.forgotText}>Forgot password?</Text>
        )}
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      {showResend && (
        <TouchableOpacity
          style={[styles.resend, (resending || cooldownSecs > 0) && styles.primaryDisabled]}
          onPress={handleResend}
          disabled={resending || cooldownSecs > 0}
          activeOpacity={0.8}
        >
          {resending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.resendText}>
              {cooldownSecs > 0 ? `RESEND AVAILABLE IN ${cooldownSecs}s` : 'RESEND CONFIRMATION EMAIL'}
            </Text>
          )}
        </TouchableOpacity>
      )}

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
  info: { color: '#aaddff', fontSize: 14, marginTop: 8, lineHeight: 20 },
  primary: { backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginTop: 16 },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  resend: {
    borderWidth: 1,
    borderColor: '#3a3a3a',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  resendText: { color: '#ffffff', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  switch: { alignItems: 'center', marginTop: 18 },
  switchText: { color: '#aaaaaa', fontSize: 14, fontWeight: '600' },
  forgot: { alignItems: 'flex-end', marginTop: 2, marginBottom: 4, paddingVertical: 4 },
  forgotText: { color: '#aaaaaa', fontSize: 14, fontWeight: '600' },
});
