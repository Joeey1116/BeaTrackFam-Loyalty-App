import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';

const STEPS = [
  {
    num: '01',
    title: 'EARN',
    text: 'Shop at beatrackfam.info, refer your friends, follow along — every bit stacks into points.',
  },
  {
    num: '02',
    title: 'CLIMB',
    text: 'Rise through the tiers: Fam, then Loyal, then Ride or Die. The higher you climb, the sweeter it gets.',
  },
  {
    num: '03',
    title: 'REDEEM',
    text: 'Cash in for 10% off, free shipping, $10 off, even a free tee. You earned it — come get it.',
  },
];

export default function Onboarding() {
  const [page, setPage] = useState(0);

  const skip = () => router.replace('/(tabs)');

  return (
    <Screen>
      {page < 2 && (
        <TouchableOpacity style={styles.skip} onPress={skip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {page === 0 && (
        <View style={styles.page}>
          <View style={styles.hero}>
            <Logo size={132} />
            <Text style={styles.brand}>BEATRACKFAM REWARDS</Text>
            <Text style={styles.headline}>EARN POINTS.{'\n'}GET REWARDED.</Text>
            <Text style={styles.subline}>Loyalty above all.</Text>
          </View>
          <Text style={styles.intro}>
            This is the rewards home of the BeaTrackFam fam — our way of saying thank you
            for rocking with us. Thank God for every single one of you.
          </Text>
        </View>
      )}

      {page === 1 && (
        <View style={styles.page}>
          <Text style={styles.headline}>HOW IT WORKS.</Text>
          <Text style={styles.subline}>Three steps. Zero fine print.</Text>
          <View style={styles.steps}>
            {STEPS.map((s) => (
              <GlassCard key={s.num} style={styles.stepCard}>
                <Text style={styles.stepNum}>{s.num}</Text>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepText}>{s.text}</Text>
              </GlassCard>
            ))}
          </View>
        </View>
      )}

      {page === 2 && (
        <View style={styles.page}>
          <View style={styles.hero}>
            <Logo size={104} />
            <Text style={styles.headline}>JOIN THE FAM.</Text>
            <Text style={styles.subline}>Your points are waiting.</Text>
          </View>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => router.push('/sign-up')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryText}>JOIN THE FAM</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondary}
            onPress={() => router.push('/sign-in')}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryText}>I have an account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.look} onPress={skip} activeOpacity={0.7}>
            <Text style={styles.lookText}>Take a look around first</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        {page < 2 ? (
          <TouchableOpacity
            style={styles.primary}
            onPress={() => setPage(page + 1)}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryText}>{page === 0 ? 'HOW IT WORKS' : 'GET STARTED'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.fineWrap}>
            <Text style={styles.fine}>From the maker of BeaTrackFam — beatrackfam.info</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skip: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
  skipText: { color: '#888888', fontSize: 15, fontWeight: '600' },
  page: { flex: 1 },
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 24 },
  brand: { color: '#888888', fontSize: 13, fontWeight: '800', letterSpacing: 4, marginTop: 20 },
  headline: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 44,
  },
  subline: { color: '#888888', fontSize: 16, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },
  intro: {
    color: '#aaaaaa',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  steps: { marginTop: 20 },
  stepCard: { marginBottom: 12 },
  stepNum: { color: '#555555', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  stepTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800', letterSpacing: 2, marginTop: 6 },
  stepText: { color: '#bbbbbb', fontSize: 14, lineHeight: 21, marginTop: 8 },
  primary: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  secondary: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 8,
  },
  secondaryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  look: { alignItems: 'center', paddingVertical: 12 },
  lookText: { color: '#888888', fontSize: 14, fontWeight: '600' },
  footer: { paddingBottom: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333333', marginHorizontal: 5 },
  dotActive: { backgroundColor: '#ffffff', width: 24 },
  fineWrap: { alignItems: 'center', paddingVertical: 18 },
  fine: { color: '#555555', fontSize: 12, letterSpacing: 1 },
});
