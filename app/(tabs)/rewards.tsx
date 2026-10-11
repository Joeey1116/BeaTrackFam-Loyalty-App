import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { RewardCard } from '../../components/RewardCard';
import {
  DEMO_USER_ID,
  getProfile,
  getRewards,
  getSessionUserId,
  redeemReward,
  type Reward,
} from '../../lib/loyalty';

export default function Rewards() {
  const [uid, setUid] = useState<string>(DEMO_USER_ID);
  const [points, setPoints] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<Reward | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const sessionId = await getSessionUserId().catch(() => null);
      const id = sessionId ?? DEMO_USER_ID;
      setUid(id);
      const [profile, list] = await Promise.all([
        getProfile(id).catch(() => null),
        getRewards().catch(() => []),
      ]);
      setPoints(profile?.points ?? 0);
      setRewards(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const confirmRedeem = (reward: Reward) => {
    Alert.alert(
      'Redeem this reward?',
      `${reward.title} — ${reward.cost} pts. This can't be undone.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Yes, redeem',
          onPress: async () => {
            setRedeeming(reward);
            const result = await redeemReward(uid, reward);
            setRedeeming(null);
            if (result.ok && result.code) {
              setCode(result.code);
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
              Alert.alert('Hmm', result.error ?? 'Could not redeem. Try again.');
            }
          },
        },
      ],
    );
  };

  const copyCode = async () => {
    if (code) {
      await Clipboard.setStringAsync(code);
      Alert.alert('Copied', 'Your code is on the clipboard.');
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

      <Modal visible={code !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>YOU'RE IN.</Text>
            <Text style={styles.modalText}>Show or enter this code at checkout:</Text>
            <Text style={styles.modalCode}>{code}</Text>
            <TouchableOpacity style={styles.primary} onPress={copyCode} activeOpacity={0.8}>
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
});
