import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { getProfile, type Profile } from '../../lib/loyalty';
import { useAuth } from '../../lib/auth';

export default function Refer() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Session state comes from AuthProvider — never resolved per-screen.
  // The tabs layout guarantees a signed-in session (build 20); the ''
  // fallback only covers the instant before the guard redirects.
  const { userId } = useAuth();
  const uid = userId ?? '';

  const refresh = useCallback(async () => {
    try {
      setProfile(await getProfile(uid).catch(() => null));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // Load on mount, again whenever the signed-in identity changes, and on
  // every focus — tab screens stay mounted, so a mount-only fetch froze
  // whatever profile the identity pointed at when the screen first ran.
  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const copyCode = async () => {
    if (profile?.referralCode) {
      await Clipboard.setStringAsync(profile.referralCode);
      Alert.alert('Copied', 'Your referral code is on the clipboard.');
    }
  };

  const share = async () => {
    if (!profile?.referralCode) return;
    try {
      await Share.share({
        message:
          `I'm earning rewards with BeaTrackFam. Join with my code ${profile.referralCode} — we both get 50 pts. Loyalty above all.`,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color="#ffffff" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.headline}>BRING THE FAM.</Text>
      <Text style={styles.subline}>Good things are better shared.</Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
        <Text style={styles.code}>{profile?.referralCode ?? '—'}</Text>
        <Text style={styles.explainer}>
          When a friend joins with your code, you both get 50 pts. No limit — the more fam, the
          more points.
        </Text>
      </View>

      <TouchableOpacity style={styles.primary} onPress={share} activeOpacity={0.8}>
        <Text style={styles.primaryText}>SHARE MY CODE</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={copyCode} activeOpacity={0.8}>
        <Text style={styles.secondaryText}>COPY CODE</Text>
      </TouchableOpacity>

      <View style={styles.countCard}>
        <Text style={styles.countNumber}>{profile?.referredCount ?? 0}</Text>
        <Text style={styles.countLabel}>
          {(profile?.referredCount ?? 0) === 1 ? 'FRIEND JOINED' : 'FRIENDS JOINED'}
        </Text>
      </View>

      <Text style={styles.fine}>
        Real ones bring real ones. Thank God for every friend you bring in.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  headline: { color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: 1, marginTop: 12 },
  subline: { color: '#888888', fontSize: 15, fontStyle: 'italic', marginTop: 6, marginBottom: 20 },
  codeCard: {
    backgroundColor: '#111111',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 16,
  },
  codeLabel: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3, marginBottom: 12 },
  code: {
    color: '#000000',
    backgroundColor: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 3,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    overflow: 'hidden',
  },
  explainer: { color: '#999999', fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 18 },
  primary: { backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 12 },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  secondary: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16 },
  secondaryText: { color: '#ffffff', fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  countCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  countNumber: { color: '#ffffff', fontSize: 40, fontWeight: '800' },
  countLabel: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3, marginTop: 6 },
  fine: { color: '#666666', fontSize: 13, textAlign: 'center', marginTop: 28, lineHeight: 20 },
});
