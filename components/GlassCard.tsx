import { type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

let GlassView: any = null;
let glassAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-glass-effect');
  GlassView = mod.GlassView;
  glassAvailable = typeof mod.isLiquidGlassAvailable === 'function'
    ? mod.isLiquidGlassAvailable()
    : Platform.OS === 'ios';
} catch {
  glassAvailable = false;
}

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  /** 'regular' (frosted) or 'clear' (more transparent) */
  variant?: 'regular' | 'clear';
}

/**
 * Liquid Glass card (iOS 26+) with graceful fallback.
 * On older iOS / Android / web it renders the standard dark card,
 * so the design never breaks anywhere.
 */
export function GlassCard({ children, style, variant = 'regular' }: GlassCardProps) {
  if (glassAvailable && GlassView) {
    return (
      <GlassView
        glassEffectStyle={variant}
        tintColor="rgba(255,255,255,0.08)"
        style={[styles.glass, style]}
      >
        {children}
      </GlassView>
    );
  }
  return <View style={[styles.fallback, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: '#111111',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 16,
  },
});
