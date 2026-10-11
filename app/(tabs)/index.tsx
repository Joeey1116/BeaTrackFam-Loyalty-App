import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { PointsCard } from '../../components/PointsCard';
import { TierBar } from '../../components/TierBar';
import {
  DEMO_USER_ID,
  getLedger,
  getProfile,
  getSessionUserId,
  tierFor,
  type LedgerEntry,
  type Profile,
} from '../../lib/loyalty';
import { registerForPushNotificationsAsync } from '../../lib/notifications';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const sessionId = await getSessionUserId();
      const uid = sessionId ?? DEMO_USER_ID;
      const [p, l] = await Promise.all([getProfile(uid), getLedger(uid)]);
      setProfile(p);
      setLedger(l.slice(0, 5));
    } catch {
      // Demo fallback keeps the screen alive even if something goes wrong.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Fire and forget — never blocks the screen.
    registerForPushNotificationsAsync().catch(() => {});
  }, [load]);

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
  const firstName = profile?.email?.split('@')[0] ?? 'fam';

  return (
    <Screen>
      <Text style={styles.greeting}>Hey {firstName}.</Text>
      <Text style={styles.subgreeting}>Thank God you're part of the Fam.</Text>

      <PointsCard points={points} tier={tierFor(points)} />
      <TierBar points={points} />

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  greeting: { color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: 1, marginTop: 12 },
  subgreeting: { color: '#888888', fontSize: 15, fontStyle: 'italic', marginTop: 6, marginBottom: 20 },
  sectionTitle: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3, marginBottom: 12 },
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
});
