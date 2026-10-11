import { Platform, StyleSheet, View } from 'react-native';

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

/**
 * Liquid Glass tab-bar background (iOS 26+). Falls back to the
 * standard translucent black bar everywhere else.
 */
export function GlassTabBackground() {
  if (glassAvailable && GlassView) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor="rgba(0,0,0,0.55)"
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.92)' }]} />;
}
