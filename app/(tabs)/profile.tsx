import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen } from '../../components/Screen';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  awardPoints,
  BIRTHDAY_REASON,
  DISPLAY_NAME_MAX,
  getLedger,
  getProfile,
  removeAvatar,
  tierFor,
  updateBirthday,
  updateDisplayName,
  uploadAvatar,
  type LedgerEntry,
  type Profile,
} from '../../lib/loyalty';
import { useAuth } from '../../lib/auth';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [birthday, setBirthday] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const configured = isSupabaseConfigured();
  // Session state comes from AuthProvider — never resolved per-screen.
  // The auth user's email doubles as the display fallback when the
  // profile row is missing or its email is empty (see the EMAIL row:
  // profile?.email || sessionEmail || '—'), so a signed-in user never
  // sees "—".
  const { userId, email: sessionEmail } = useAuth();
  // The tabs layout guarantees a signed-in session (build 20); the ''
  // fallback only covers the instant before the guard redirects.
  const uid = userId ?? '';

  const refresh = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([
        getProfile(uid).catch(() => null),
        getLedger(uid).catch(() => []),
      ]);
      setProfile(p);
      setLedger(l);
      if (p?.birthday) setBirthday(p.birthday);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // Load on mount, again whenever the signed-in identity changes, and on
  // every focus — tab screens stay mounted, so a mount-only fetch goes
  // stale the moment the session changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // The 100-pt birthday bonus: claim state comes from the ledger (see
  // lib/loyalty.ts buildProfile), never from the date field — so editing
  // the birthday can never re-arm it.
  const claimBirthdayBonus = async () => {
    if (!profile?.birthday || profile.birthdayBonusClaimed) return;
    setSaving(true);
    try {
      const result = await awardPoints(uid, 100, BIRTHDAY_REASON);
      if (result.ok) {
        Alert.alert('Happy birthday season.', '+100 pts, on us. We celebrate you.');
      }
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const openEditProfile = () => {
    setEditName(profile?.displayName ?? '');
    setEditBirthday(profile?.birthday ?? '');
    setEditOpen(true);
  };

  const saveEditProfile = async () => {
    setSavingProfile(true);
    try {
      if (editName.trim() !== (profile?.displayName ?? '')) {
        const named = await updateDisplayName(uid, editName);
        if (!named.ok) {
          Alert.alert('Hmm', named.error ?? 'Could not save your name.');
          return;
        }
      }
      if (editBirthday.trim() !== (profile?.birthday ?? '')) {
        const born = await updateBirthday(uid, editBirthday);
        if (!born.ok) {
          Alert.alert('Hmm', born.error ?? 'Could not save your birthday.');
          return;
        }
      }
      setEditOpen(false);
      await refresh();
    } finally {
      setSavingProfile(false);
    }
  };

  const changePhoto = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'No photo access',
          'We need photo-library permission to set your profile photo. You can turn it on in Settings — or skip the photo, the Fam loves you anyway.',
        );
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      setUploadingPhoto(true);
      const result = await uploadAvatar(uid, picked.assets[0].uri);
      setUploadingPhoto(false);
      if (!result.ok) {
        Alert.alert('Hmm', result.error ?? 'Could not upload that photo.');
        return;
      }
      await refresh();
    } catch {
      setUploadingPhoto(false);
      Alert.alert('Hmm', 'Could not open your photo library on this device.');
    }
  };

  const removePhoto = async () => {
    setUploadingPhoto(true);
    const result = await removeAvatar(uid);
    setUploadingPhoto(false);
    if (!result.ok) Alert.alert('Hmm', result.error ?? 'Could not remove your photo.');
    await refresh();
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
  // The tabs are session-guarded (build 20), so this screen only renders
  // for a real signed-in user; this stays as a belt-and-braces check so
  // the Delete Account action can never render without a session.
  const isSignedIn = !!userId;

  return (
    <Screen>
      <Text style={styles.headline}>MY PROFILE.</Text>
      <Text style={styles.subline}>This is your corner of the Fam.</Text>

      <View style={styles.card}>
        <View style={styles.identityRow}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {(profile?.displayName || profile?.email || 'F').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.identityText}>
            <Text style={styles.displayName}>
              {profile?.displayName || profile?.email?.split('@')[0] || 'Fam'}
            </Text>
            <Text style={styles.identityEmail}>{profile?.email || sessionEmail || '—'}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.secondary} onPress={openEditProfile} activeOpacity={0.8}>
          <Text style={styles.secondaryText}>EDIT PROFILE</Text>
        </TouchableOpacity>
        <Text style={styles.cardLabel}>TIER</Text>
        <Text style={styles.tierBadge}>{tier.name.toUpperCase()}</Text>
        <Text style={styles.cardLabel}>POINTS</Text>
        <Text style={styles.cardValue}>{(profile?.points ?? 0).toLocaleString()} pts</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>BIRTHDAY</Text>
        {!profile?.birthday ? (
          <>
            <Text style={styles.hint}>
              Set your birthday in Edit Profile — it powers your 100-pt birthday bonus and your
              birthday reward.
            </Text>
            <TouchableOpacity style={styles.secondary} onPress={openEditProfile} activeOpacity={0.8}>
              <Text style={styles.secondaryText}>SET BIRTHDAY</Text>
            </TouchableOpacity>
          </>
        ) : profile.birthdayBonusClaimed ? (
          <Text style={styles.cardValue}>{profile.birthday} — bonus claimed 🎂</Text>
        ) : (
          <>
            <Text style={styles.cardValue}>{profile.birthday}</Text>
            <Text style={styles.hint}>Your birthday bonus is waiting — 100 pts, on us.</Text>
            <TouchableOpacity
              style={[styles.primary, saving && styles.primaryDisabled]}
              onPress={claimBirthdayBonus}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryText}>CLAIM 100 PTS</Text>
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
        <Text style={styles.cardLabel}>PRIVACY POLICY</Text>
        <Text style={styles.hint}>
          What we collect, how we use it, and the choices you have — the full policy, right here in
          the app.
        </Text>
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => router.push('/privacy-policy')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryText}>VIEW PRIVACY POLICY</Text>
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

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>EDIT PROFILE</Text>

            <View style={styles.modalPhotoRow}>
              {profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>
                    {(profile?.displayName || profile?.email || 'F').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.modalPhotoButtons}>
                <TouchableOpacity
                  style={styles.secondary}
                  onPress={changePhoto}
                  disabled={uploadingPhoto}
                  activeOpacity={0.8}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.secondaryText}>
                      {profile?.avatarUrl ? 'CHANGE PHOTO' : 'ADD PHOTO'}
                    </Text>
                  )}
                </TouchableOpacity>
                {profile?.avatarUrl && (
                  <TouchableOpacity
                    style={styles.secondary}
                    onPress={removePhoto}
                    disabled={uploadingPhoto}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.secondaryText}>REMOVE PHOTO</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.cardLabel}>DISPLAY NAME</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="What should we call you?"
              placeholderTextColor="#555555"
              autoCorrect={false}
              maxLength={DISPLAY_NAME_MAX}
            />
            <Text style={styles.cardLabel}>BIRTHDAY</Text>
            <TextInput
              style={styles.input}
              value={editBirthday}
              onChangeText={setEditBirthday}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#555555"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Heads up: birthday rewards are tracked by claim, once per cycle — changing the date
              doesn't reset a claim.
            </Text>
            <Text style={styles.cardLabel}>EMAIL</Text>
            <Text style={styles.cardValue}>{profile?.email || sessionEmail || '—'}</Text>
            <Text style={styles.hint}>Your sign-in email can't be changed here.</Text>

            <TouchableOpacity
              style={[styles.primary, savingProfile && styles.primaryDisabled]}
              onPress={saveEditProfile}
              disabled={savingProfile}
              activeOpacity={0.8}
            >
              {savingProfile ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryText}>SAVE</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => setEditOpen(false)}
              disabled={savingProfile}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  headline: { color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: 1, marginTop: 12 },
  subline: { color: '#888888', fontSize: 15, fontStyle: 'italic', marginTop: 6, marginBottom: 20 },
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
  identityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#222222' },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3a3a3a' },
  avatarInitial: { color: '#ffffff', fontSize: 26, fontWeight: '800' },
  identityText: { flex: 1, marginLeft: 14 },
  displayName: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  identityEmail: { color: '#888888', fontSize: 14, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#111111',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  modalTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  modalPhotoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 6 },
  modalPhotoButtons: { flex: 1, marginLeft: 14, gap: 8 },
});
