import { StyleSheet, Text, View } from 'react-native';
import { TIERS, tierFor } from '../lib/loyalty';

export function TierBar({ points }: { points: number }) {
  const current = tierFor(points);
  const currentIndex = TIERS.findIndex((t) => t.id === current.id);
  const next = TIERS[currentIndex + 1];
  const progress = next
    ? Math.min(1, (points - current.minPoints) / (next.minPoints - current.minPoints))
    : 1;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>MY JOURNEY</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        {TIERS.map((tier) => (
          <View key={tier.id} style={styles.tierCol}>
            <View style={[styles.dot, tier.id === current.id && styles.dotActive]} />
            <Text style={[styles.tierName, tier.id === current.id && styles.tierNameActive]}>
              {tier.name}
            </Text>
            <Text style={styles.tierMin}>{tier.minPoints} pts</Text>
          </View>
        ))}
      </View>
      {next ? (
        <Text style={styles.next}>{next.minPoints - points} pts to {next.name}</Text>
      ) : (
        <Text style={styles.next}>Top of the mountain — thank God.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#111111',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 20,
  },
  heading: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 3, marginBottom: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#2a2a2a', overflow: 'hidden', marginBottom: 16 },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#ffffff' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  tierCol: { alignItems: 'center', flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3a3a3a', marginBottom: 6 },
  dotActive: { backgroundColor: '#ffffff' },
  tierName: { color: '#666666', fontSize: 12, fontWeight: '700' },
  tierNameActive: { color: '#ffffff' },
  tierMin: { color: '#555555', fontSize: 11, marginTop: 2 },
  next: { color: '#aaaaaa', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 14 },
});
