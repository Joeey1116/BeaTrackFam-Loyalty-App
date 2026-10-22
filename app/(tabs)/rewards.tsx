import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { RewardCard } from '../../components/RewardCard';
import {
  DEMO_USER_ID,
  getProfile,
  getRedemptions,
  getRewards,
  makeIdempotencyKey,
  redeemReward,
  type Redemption,
  type Reward,
} from '../../lib/loyalty';
import { useAuth } from '../../lib/auth';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Rewards() {
  const [points, setPoints] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<Reward | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeEmailed, setCodeEmailed] = useState(false);
  // One idempotency key per redemption attempt, kept across retries of
  // the SAME attempt — the server honors each key exactly once, so a
  // double-tap or flaky network can't mint two codes or deduct twice.
  const attemptKeys = useRef(new Map<string, string>());
  // Session state comes from AuthProvider — never resolved per-screen.
  const { userId } = useAuth();
  const uid = userId ?? DEMO_USER_ID;

  const refresh = useCallback(async () => {
    try {
      const [profile, list, mine] = await Promise.all([
        getProfile(uid).catch(() => null),
        getRewards().catch(() => []),
        getRedemptions(uid).catch(() => []),
      ]);
      setPoints(profile?.points ?? 0);
      setRewards(list);
      setRedemptions(mine);
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

  const confirmRedeem = (reward: Reward) => {
    // A fresh attempt gets a fresh idempotency key; backing out without
    // redeeming retires the key unused.
    let key = attemptKeys.current.get(reward.id);
    if (!key) {
      key = makeIdempotencyKey();
      attemptKeys.current.set(reward.id, key);
    }
    Alert.alert(
      'Redeem this reward?',
      `${reward.title} — ${reward.cost} pts. This can't be undone.`,
      [
        {
          text: 'Not yet',
          style: 'cancel',
          onPress: () => attemptKeys.current.delete(reward.id),
        },
        {
          text: 'Yes, redeem',
          onPress: async () => {
            setRedeeming(reward);
            const result = await redeemReward(uid, reward, key!);
            setRedeeming(null);
            if (result.ok && result.code) {
              attemptKeys.current.delete(reward.id);
              setCode(result.code);
              setCodeEmailed(!!result.emailSent);
              // Milestone reached — close out the Live Activity with a win.
              try {
                const { endMilestoneActivity } = await import('../../lib/liveActivity');
                await endMilestoneActivity({
                  points: reward.cost,
                  target: reward.cost,
                  rewardName: 'Reward unlocked!',
                  expiresText: '',
                });
              } catch {
                // Live Activities unavailable — silent no-op.
              }
              await refresh();
            } else {
              // Keep the attempt key: a retry of this attempt replays
              // against the same key and can never double-charge.
              Alert.alert('Hmm', result.error ?? 'Could not redeem. Try again.');
            }
          },
        },
      ],
    );
  };

  const copyCode = async (value: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', 'Your code is on the clipboard.');
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
      <Text style={styles.headline}>YOUR REWARDS.</Text>
      <Text style={styles.subline}>You earned it. Cash it in.</Text>
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>AVAILABLE</Text>
        <Text style={styles.balance}>{points.toLocaleString()} pts</Text>
      </View>

      {rewards.map((reward) => (
        <RewardCard
          key={reward.id}
          reward={reward}
          canAfford={points >= reward.cost}
          onRedeem={() => confirmRedeem(reward)}
        />
      ))}

      <Text style={styles.sectionTitle}>MY CODES</Text>
      {redemptions.length === 0 ? (
        <Text style={styles.empty}>
          Nothing redeemed yet. Your codes will live here — and in your email — for good.
        </Text>
      ) : (
        redemptions.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={styles.codeRow}
            onPress={() => copyCode(r.code)}
            activeOpacity={0.7}
          >
            <View style={styles.codeRowText}>
              <Text style={styles.codeRowTitle}>{r.rewardTitle}</Text>
              <Text style={styles.codeRowDate}>
                {formatDate(r.createdAt)}{r.status !== 'active' ? ` — ${r.status}` : ''}
              </Text>
            </View>
            <Text style={styles.codeRowCode}>{r.code}</Text>
          </TouchableOpacity>
        ))
      )}

      <Modal visible={code !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>YOU'RE IN.</Text>
            <Text style={styles.modalText}>
              Show or enter this code at checkout:
              {codeEmailed
                ? ' We emailed it to you too, and it lives under MY CODES below.'
                : ' It lives under MY CODES below — it is not going anywhere.'}
            </Text>
            <Text style={styles.modalCode}>{code}</Text>
            <TouchableOpacity style={styles.primary} onPress={() => code && copyCode(code)} activeOpacity={0.8}>
              <Text style={styles.primaryText}>COPY CODE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={() => setCode(null)} activeOpacity={0.8}>
              <Text style={styles.secondaryText}>Done</Text>
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
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 16,
  },
  balanceLabel: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3 },
  balance: { color: '#ffffff', fontSize: 24, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: { backgroundColor: '#111111', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  modalTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800', letterSpacing: 2 },
  modalText: { color: '#999999', fontSize: 14, marginTop: 10, textAlign: 'center' },
  modalCode: {
    color: '#000000',
    backgroundColor: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 18,
    overflow: 'hidden',
  },
  primary: { backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 22 },
  primaryText: { color: '#000000', fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  secondary: { marginTop: 12, paddingVertical: 10 },
  secondaryText: { color: '#aaaaaa', fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3, marginTop: 16, marginBottom: 12 },
  empty: { color: '#666666', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 10,
  },
  codeRowText: { flex: 1, paddingRight: 12 },
  codeRowTitle: { color: '#dddddd', fontSize: 14, fontWeight: '700' },
  codeRowDate: { color: '#666666', fontSize: 12, marginTop: 2 },
  codeRowCode: { color: '#ffffff', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
});
