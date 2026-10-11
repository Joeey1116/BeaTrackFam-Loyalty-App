import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Logo } from '../components/Logo';

const PERKS = [
  { icon: '🛍️', text: 'Earn points on every order — 25 pts just for shopping with us.' },
  { icon: '🎂', text: 'A 100-pt birthday bonus every year, because we celebrate you.' },
  { icon: '🔥', text: 'Members-only drops and rewards you will not see anywhere else.' },
];

export default function Onboarding() {
  return (
    <Screen>
      <View style={styles.hero}>
        <Logo size={120} />
        <Text style={styles.headline}>EARN POINTS.{'\n'}GET REWARDED.</Text>
        <Text style={styles.subline}>Loyalty above all.</Text>
      </View>

      <View style={styles.perks}>
        {PERKS.map((perk, i) => (
          <View key={i} style={styles.perkRow}>
            <Text style={styles.perkIcon}>{perk.icon}</Text>
            <Text style={styles.perkText}>{perk.text}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.primary} onPress={() => router.push('/sign-up')} activeOpacity={0.8}>
        <Text style={styles.primaryText}>JOIN THE FAM</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => router.push('/sign-in')} activeOpacity={0.8}>
        <Text style={styles.secondaryText}>I have an account</Text>
      </TouchableOpacity>

      <Text style={styles.fine}>
        This is our way of saying thank you — thank God for every single one of you.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 40, marginBottom: 32 },
  headline: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 42,
  },
  subline: { color: '#888888', fontSize: 16, fontStyle: 'italic', marginTop: 10 },
  perks: { marginBottom: 32 },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 12,
  },
  perkIcon: { fontSize: 28, marginRight: 14 },
  perkText: { color: '#dddddd', fontSize: 15, flex: 1, lineHeight: 22 },
  primary: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '800', letterSpacing: 2 },
  secondary: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  secondaryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  fine: { color: '#666666', fontSize: 13, textAlign: 'center', marginTop: 28, lineHeight: 20 },
});
