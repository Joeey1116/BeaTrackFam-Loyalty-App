import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  /** 'regular' (frosted) or 'clear' (more transparent) */
  variant?: 'regular' | 'clear';
}

/**
 * Frosted-glass card.
 *
 * Uses expo-blur's BlurView as the primary implementation (reliable across
 * builds) with a sheen and edge highlight so cards read as glass. Falls
 * back gracefully to a solid dark card if the native blur module is ever
 * unavailable, so the design never breaks.
 */
export function GlassCard({ children, style, variant = 'regular' }: GlassCardProps) {
  const bg = variant === 'clear' ? 'rgba(20,20,22,0.35)' : 'rgba(24,24,26,0.55)';
  return (
    <View style={[styles.wrap, style]}>
      <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'transparent']}
        locations={[0, 0.5]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  inner: {
    padding: 18,
  },
});
