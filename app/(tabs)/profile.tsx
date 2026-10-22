import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen } from '../../components/Screen';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  awardPoints,
  BIRTHDAY_REASON,
  DEMO_USER_ID,
  getLedger,
  getProfile,
  getSessionUserId,
  tierFor,
  type LedgerEntry,
  type Profile,
} from '../../lib/loyalty';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProfileScreen() {
  const [uid, setUid] = useState<string>(DEMO_USER_ID);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [birthday, setBirthday] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  const refresh = useCallback(async () => {
    try {
      const sessionId = await getSessionUserId().catch(() => null);
      const id = sessionId ?? DEMO_USER_ID;
      setUid(id);
      const [p, l] = await Promise.all([getProfile(id).catch(() => null), getLedger(id).catch(() => [])]);
      setProfile(p);
      setLedger(l);
      if (p?.birthday) setBirthday(p.birthday);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveBirthday = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday.trim())) {
      Alert.alert('Hmm', 'Use the YYYY-MM-DD format, like 2001-11-16.');
      return;
    }
    if (!profile || profile.birthdayBonusClaimed) return;
    setSaving(true);
    try {
      if (configured && supabase) {
        // Real schema has no birthday_bonus_claimed column — the bonus state
        // is derived from the ledger (see lib/loyalty.ts buildProfile).
        await supabase.from('profiles').update({ birthday: birthday.trim() }).eq('id', uid);
      } else if (profile) {
        profile.birthday = birthday.trim();
        profile.birthdayBonusClaimed = true;
      }
      const result = await awardPoints(uid, 100, BIRTHDAY_REASON);
      if (result.ok) {
        Alert.alert('Happy birthday season.', '+100 pts, on us. We celebrate you.');
      }
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    if (configured && supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    router.replace('/onboarding');
  };

  const deleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your BeaTrackFam Rewards account. Your points, redeemed rewards, and history are gone forever and cannot be restored or transferred.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'There is no undo. Tap "Yes, delete my account" to permanently delete it now.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, delete my account', style: 'destructive', onPress: confirmDeleteAccount },
              ],
            );
          },
        },
      ],
    );
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      if (configured && supabase) {
        // The Edge Function deletes the caller's auth user; the schema's
        // cascades wipe their profile, points ledger, and redemptions.
        const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
        if (error) throw error;
      }
      // Account is gone server-side — clear the local session (AsyncStorage)
      // and head back to the start.
      await signOut();
    } catch {
      Alert.alert(
        'Could not delete your account',
        'Something went wrong and nothing was deleted. Check your connection and try again — or email us at contact@beatrackfam.info and we will take care of it.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const [trackingStatus, setTrackingStatus] = useState<string | null>(null);

  const checkTracking = async () => {
    try {
      const { getTrackingPermissionsAsync } = await import('expo-tracking-transparency');
      const { status } = await getTrackingPermissionsAsync();
      setTrackingStatus(status);
    } catch {
      setTrackingStatus('unavailable');
    }
  };

  useEffect(() => {
    checkTracking();
  }, []);

  const requestTracking = async () => {
    // We run zero ads and zero third-party tracking SDKs, so this prompt
    // only ever fires when YOU tap this row. Nothing is tracked otherwise.
    try {
      const { requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
      const { status } = await requestTrackingPermissionsAsync();
      setTrackingStatus(status);
      Alert.alert(
        status === 'granted' ? 'All set.' : 'No problem.',
        status === 'granted'
          ? 'You allowed tracking. You can change this anytime in Settings.'
          : 'Tracking stays off. Nothing about the app changes.',
      );
    } catch {
      Alert.alert('Hmm', 'Could not open the tracking prompt on this device.');
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

  const tier = tierFor(profile?.points ?? 0);
  // uid falls back to DEMO_USER_ID whenever there is no Supabase session
  // (signed out, or Supabase unconfigured). Delete Account is an
  // account-holder action, so it renders only for a real signed-in user.
  const isSignedIn = uid !== DEMO_USER_ID;

  return (
    <Screen>
      <Text style={styles.headline}>MY PROFILE.</Text>
      <Text style={styles.subline}>This is your corner of the Fam.</Text>

      {!configured && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoTitle}>DEMO MODE</Text>
          <Text style={styles.demoText}>
            Sample points, nothing saved. Connect the database to make it real.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>EMAIL</Text>
        <Text style={styles.cardValue}>{profile?.email ?? '—'}</Text>
        <Text style={styles.cardLabel}>TIER</Text>
        <Text style={styles.tierBadge}>{tier.name.toUpperCase()}</Text>
        <Text style={styles.cardLabel}>POINTS</Text>
        <Text style={styles.cardValue}>{(profile?.points ?? 0).toLocaleString()} pts</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>BIRTHDAY</Text>
        {profile?.birthdayBonusClaimed ? (
          <Text style={styles.cardValue}>{profile.birthday} — bonus claimed 🎂</Text>
        ) : (
          <>
            <Text style={styles.hint}>Set it once, get 100 pts every year.</Text>
            <TextInput
              style={styles.input}
              value={birthday}
              onChangeText={setBirthday}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#555555"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.primary, saving && styles.primaryDisabled]}
              onPress={saveBirthday}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryText}>SAVE BIRTHDAY</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>PRIVACY</Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>NOTIFICATIONS</Text>
        <Text style={styles.hint}>
          Reward drops, points milestones, and referral alerts. Manage anytime in your phone settings.
        </Text>
        <Text style={styles.cardLabel}>APP TRACKING</Text>
        <Text style={styles.hint}>
          We run no ads and no third-party tracking SDKs. This stays off unless you turn it on.
        </Text>
        <TouchableOpacity style={styles.secondary} onPress={requestTracking} activeOpacity={0.8}>
          <Text style={styles.secondaryText}>
            {trackingStatus === 'granted' ? 'TRACKING: ON' : 'ALLOW TRACKING'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>POINTS HISTORY</Text>
      {ledger.length === 0 ? (
        <Text style={styles.empty}>Nothing yet.</Text>
      ) : (
        ledger.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowReason}>{entry.reason}</Text>
              <Text style={styles.rowDate}>{formatDate(entry.createdAt)}</Text>
            </View>
            <Text style={[styles.rowDelta, entry.delta < 0 && styles.rowDeltaNeg]}>
              {entry.delta > 0 ? '+' : ''}{entry.delta}
            </Text>
          </View>
        ))
      )}

      <TouchableOpacity
        style={styles.contact}
        onPress={() => Linking.openURL('mailto:contact@beatrackfam.info')}
        activeOpacity={0.8}
      >
        <Text style={styles.contactText}>Questions or concerns? Email us at contact@beatrackfam.info</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.8}>
        <Text style={styles.signOutText}>SIGN OUT</Text>
      </TouchableOpacity>

      {isSignedIn && (
        <>
          <TouchableOpacity
            style={[styles.deleteAccount, deleting && styles.deleteAccountDisabled]}
            onPress={deleteAccount}
            disabled={deleting}
            activeOpacity={0.8}
          >
            {deleting ? (
              <ActivityIndicator color="#ff6666" />
            ) : (
              <Text style={styles.deleteAccountText}>DELETE ACCOUNT</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.deleteHint}>
            Permanently deletes your account, points, and rewards. This cannot be undone.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  headline: { color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: 1, marginTop: 12 },
  subline: { color: '#888888', fontSize: 15, fontStyle: 'italic', marginTop: 6, marginBottom: 20 },
  demoBanner: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    marginBottom: 16,
    alignItems: 'center',
  },
  demoTitle: { color: '#ffffff', fontSize: 13, fontWeight: '800', letterSpacing: 3, marginBottom: 6 },
  demoText: { color: '#999999', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  card: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 16,
  },
  cardLabel: { color: '#888888', fontSize: 11, fontWeight: '700', letterSpacing: 3, marginTop: 12 },
  cardValue: { color: '#ffffff', fontSize: 17, fontWeight: '700', marginTop: 4 },
  tierBadge: {
    color: '#000000',
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 6,
    overflow: 'hidden',
  },
  hint: { color: '#777777', fontSize: 13, marginTop: 6, marginBottom: 8 },
  input: {
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  primary: { backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#000000', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  secondary: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3a',
    marginTop: 4,
  },
  secondaryText: { color: '#ffffff', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  sectionTitle: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3, marginBottom: 12, marginTop: 8 },
  empty: { color: '#666666', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 10,
  },
  rowText: { flex: 1 },
  rowReason: { color: '#dddddd', fontSize: 14, fontWeight: '600' },
  rowDate: { color: '#666666', fontSize: 12, marginTop: 2 },
  rowDelta: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  rowDeltaNeg: { color: '#ff9999' },
  contact: { alignItems: 'center', marginTop: 24, paddingHorizontal: 16 },
  contactText: { color: '#aaaaaa', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  signOut: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#5a2a2a',
    marginTop: 20,
  },
  signOutText: { color: '#ff9999', fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  deleteAccount: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7a1f1f',
    backgroundColor: '#1c0505',
    marginTop: 28,
  },
  deleteAccountDisabled: { opacity: 0.5 },
  deleteAccountText: { color: '#ff5555', fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  deleteHint: { color: '#666666', fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17 },
});
