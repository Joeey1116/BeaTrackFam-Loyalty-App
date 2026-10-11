import { StyleSheet, Text, View } from 'react-native';
import type { TierInfo } from '../lib/loyalty';

export function PointsCard({ points, tier }: { points: number; tier: TierInfo }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>MY POINTS</Text>
      <Text style={styles.points}>{points.toLocaleString()}</Text>
      <Text style={styles.tier}>{tier.name} TIER</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111111',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 20,
  },
  label: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3 },
  points: { color: '#ffffff', fontSize: 56, fontWeight: '800', letterSpacing: 1, marginTop: 8 },
  tier: { color: '#ffffff', fontSize: 14, fontWeight: '800', letterSpacing: 2, marginTop: 8 },
});
