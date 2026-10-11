import { StyleSheet, Text } from 'react-native';
import type { TierInfo } from '../lib/loyalty';
import { GlassCard } from './GlassCard';

export function PointsCard({ points, tier }: { points: number; tier: TierInfo }) {
  return (
    <GlassCard style={styles.card}>
      <Text style={styles.label}>MY POINTS</Text>
      <Text style={styles.points}>{points.toLocaleString()}</Text>
      <Text style={styles.tier}>{tier.name} TIER</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  label: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3 },
  points: { color: '#ffffff', fontSize: 56, fontWeight: '800', letterSpacing: 1, marginTop: 8 },
  tier: { color: '#ffffff', fontSize: 14, fontWeight: '800', letterSpacing: 2, marginTop: 8 },
});
