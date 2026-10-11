import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Reward } from '../lib/loyalty';

export function RewardCard({
  reward,
  canAfford,
  onRedeem,
}: {
  reward: Reward;
  canAfford: boolean;
  onRedeem: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{reward.title}</Text>
        <Text style={styles.description}>{reward.description}</Text>
        <Text style={styles.cost}>{reward.cost} pts</Text>
      </View>
      <TouchableOpacity
        style={[styles.button, !canAfford && styles.buttonDisabled]}
        onPress={onRedeem}
        disabled={!canAfford}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>{canAfford ? 'REDEEM' : 'LOCKED'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 12,
  },
  textCol: { flex: 1, paddingRight: 12 },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  description: { color: '#999999', fontSize: 13, marginTop: 4 },
  cost: { color: '#ffffff', fontSize: 14, fontWeight: '800', marginTop: 8, letterSpacing: 1 },
  button: { backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  buttonDisabled: { backgroundColor: '#3a3a3a' },
  buttonText: { color: '#000000', fontSize: 13, fontWeight: '800' },
});
