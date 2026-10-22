import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../components/Screen';
import { PointsCard } from '../../components/PointsCard';
import { TierBar } from '../../components/TierBar';
import { GlassCard } from '../../components/GlassCard';
import {
  DEMO_USER_ID,
  getLedger,
  getProfile,
  tierFor,
  type LedgerEntry,
  type Profile,
} from '../../lib/loyalty';
import { useAuth } from '../../lib/auth';
// NOTE: lib/notifications intentionally NOT imported here. Its
// requestPermissionsAsync() path hard-crashes on device (Oct 2026);
// the push prompt now deep-links to iOS Settings instead.
import { takeEmailConfirmedPending } from '../../lib/emailConfirmed';

const PUSH_PROMPT_KEY = 'btr_push_prompt_seen';

async function hasSeenPushPrompt(): Promise<boolean> {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    return (await AsyncStorage.getItem(PUSH_PROMPT_KEY)) === '1';
  } catch {
    return true; // Storage unavailable — don't nag.
  }
}

async function markPushPromptSeen(): Promise<void> {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(PUSH_PROMPT_KEY, '1');
  } catch {
    // Best effort.
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  // Session state comes from AuthProvider — never resolved per-screen.
  const { userId } = useAuth();
  const authUid = userId ?? DEMO_USER_ID;
  const uidRef = useRef<string>(authUid);
  uidRef.current = authUid;

  const load = useCallback(async () => {
    try {
      const uid = uidRef.current;
      const [p, l] = await Promise.all([getProfile(uid), getLedger(uid)]);
      setProfile(p);
      setLedger(l.slice(0, 5));
      // Live Activities auto-start is DISABLED (Oct 15 2026): expo-widgets'
      // PointsActivity.start() hard-crashes on device ~1s after the Home tab
      // loads (ActivityKit request with the widget extension not fully
      // configured — App Groups etc.). The tab bar renders fine, so the
      // crash is in this post-load async path. Re-enable only after
      // expo-widgets is fully configured and verified on a device build.
    } catch {
      // Demo fallback keeps the screen alive even if something goes wrong.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reload when the signed-in identity changes under an already-mounted
  // Home (e.g. a confirmation deep link signs the user in while they were
  // browsing in demo mode) — tab screens stay mounted, so without this
  // the demo profile would stick.
  const seenUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (seenUidRef.current === null) {
      seenUidRef.current = authUid;
      return;
    }
    if (seenUidRef.current !== authUid) {
      seenUidRef.current = authUid;
      load();
    }
  }, [authUid, load]);

  // One-time welcome after confirming the email via the deep link. The
  // flag is only set once a session actually exists (see lib/auth).
  useEffect(() => {
    if (userId && takeEmailConfirmedPending()) setShowWelcome(true);
  }, [userId]);

  // Refetch whenever Home regains focus (the mount load above covers the
  // first focus). Tab screens stay mounted, so without this a session that
  // landed after first mount — e.g. an email-confirmation sign-in — never
  // showed up until the app was force-closed.
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // First-launch push permission: our own explainer first, so the OS prompt
  // never blindsides anyone. Shown exactly once. "TURN ON" deep-links to
  // iOS Settings (build 12) — the in-app native permission request
  // hard-crashes on device, so we never call it.
  useEffect(() => {
    if (loading) return;
    hasSeenPushPrompt().then((seen) => {
      if (!seen) {
        // Slight delay so this doesn't collide with the ATT prompt.
        setTimeout(() => setShowPushPrompt(true), 4000);
      }
    });
  }, [loading]);

  // App Tracking Transparency: ask once on launch, after a short delay so
  // the prompt doesn't fire mid-render or collide with the push explainer.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      try {
        const { default: AsyncStorage } = await import(
          '@react-native-async-storage/async-storage'
        );
        const seen = await AsyncStorage.getItem('@beatrackfam.attPromptSeen');
        if (seen || cancelled) return;
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled) return;
        const { requestTrackingPermissionsAsync } = await import(
          'expo-tracking-transparency'
        );
        await requestTrackingPermissionsAsync();
        await AsyncStorage.setItem('@beatrackfam.attPromptSeen', '1');
      } catch {
        // Tracking stays off — the app works fine without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading]);

  const handlePushChoice = useCallback(async (enable: boolean) => {
    setShowPushPrompt(false);
    await markPushPromptSeen();
    if (!enable) return;
    // The Oct 2026 crash was the NativeTabs bar, not the notification
    // dialog — so we use the real iOS permission prompt. This registers
    // the app for notifications, which makes the Notifications toggle
    // appear in iOS Settings.
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.requestPermissionsAsync();
    } catch {
      // Permission request unavailable — nothing to do.
    }
  }, []);

  const openShop = useCallback(async () => {
    try {
      const { openBrowserAsync } = await import('expo-web-browser');
      await openBrowserAsync('https://beatrackfam.info');
    } catch {
      // Browser unavailable — the Earn tab's shop link is the fallback.
    }
  }, []);

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color="#ffffff" />
        </View>
      </Screen>
    );
  }

  const points = profile?.points ?? 0;
  // Greet by display name when one is set (Edit Profile) — first word of
  // it — and fall back to the email prefix, as before.
  const displayFirst = profile?.displayName?.trim().split(/\s+/)[0];
  const firstName = displayFirst || profile?.email?.split('@')[0] || 'fam';

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />
      }
    >
      {showWelcome && (
        <TouchableOpacity
          style={styles.welcomeBanner}
          onPress={() => setShowWelcome(false)}
          activeOpacity={0.8}
        >
          <Text style={styles.welcomeTitle}>EMAIL CONFIRMED — WELCOME TO THE FAM.</Text>
          <Text style={styles.welcomeText}>Your account is live. Start earning points.</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.greeting}>Hey {firstName}.</Text>
      <Text style={styles.subgreeting}>Thank God you're part of the Fam.</Text>

      <PointsCard points={points} tier={tierFor(points)} />
      <TierBar points={points} />

      <GlassCard style={styles.shopCard}>
        <Text style={styles.shopLabel}>BEATRACKFAM.INFO</Text>
        <Text style={styles.shopTitle}>Fresh drops, fam favorites.</Text>
        <Text style={styles.shopText}>
          Every order earns 25 pts — from the maker of BeaTrackFam.
        </Text>
        <TouchableOpacity style={styles.shopButton} onPress={openShop} activeOpacity={0.8}>
          <Text style={styles.shopButtonText}>SHOP NOW</Text>
        </TouchableOpacity>
      </GlassCard>

      <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
      {ledger.length === 0 ? (
        <Text style={styles.empty}>Nothing yet — go earn your first points.</Text>
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

      <Modal visible={showPushPrompt} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>STAY IN THE LOOP.</Text>
            <Text style={styles.modalText}>
              Want a heads-up when new rewards drop or you hit a points milestone?
              We keep it to the good stuff — no spam, ever.
            </Text>
            <TouchableOpacity
              style={styles.modalPrimary}
              onPress={() => handlePushChoice(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalPrimaryText}>TURN ON NOTIFICATIONS</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handlePushChoice(false)} activeOpacity={0.7}>
              <Text style={styles.modalSecondary}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  welcomeBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    alignItems: 'center',
  },
  welcomeTitle: { color: '#000000', fontSize: 14, fontWeight: '800', letterSpacing: 1, textAlign: 'center' },
  welcomeText: { color: '#333333', fontSize: 13, marginTop: 4, textAlign: 'center' },
  greeting: { color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: 1, marginTop: 12 },
  subgreeting: { color: '#888888', fontSize: 15, fontStyle: 'italic', marginTop: 6, marginBottom: 20 },
  sectionTitle: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3, marginBottom: 12 },
  shopCard: { marginBottom: 20, paddingVertical: 22 },
  shopLabel: { color: '#888888', fontSize: 11, fontWeight: '800', letterSpacing: 3, textAlign: 'center' },
  shopTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginTop: 8 },
  shopText: { color: '#aaaaaa', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  shopButton: { backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  shopButtonText: { color: '#000000', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  empty: { color: '#666666', fontSize: 14, lineHeight: 20 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  modalTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
  modalText: { color: '#aaaaaa', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 20 },
  modalPrimary: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  modalPrimaryText: { color: '#000000', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  modalSecondary: { color: '#888888', fontSize: 14, fontWeight: '600', paddingVertical: 8 },
});
