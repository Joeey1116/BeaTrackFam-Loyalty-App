import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

let GlassView: any = null;
let glassAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-glass-effect');
  GlassView = mod.GlassView;
  glassAvailable =
    typeof mod.isLiquidGlassAvailable === 'function'
      ? mod.isLiquidGlassAvailable()
      : Platform.OS === 'ios';
} catch {
  glassAvailable = false;
}

/**
 * Liquid Glass tab-bar background (iOS 26+). Falls back to a layered
 * frosted-glass look (blur + light sheen + edge highlight) on older
 * iOS / Android / web so the bar always reads as glass.
 */
export function GlassTabBackground() {
  if (glassAvailable && GlassView) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor="rgba(40,10,60,0.5)"
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={90}
        tint="dark"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(24,10,32,0.55)' }]}
      />
      {/* Light sheen catching the top of the glass */}
      <LinearGradient
        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.02)', 'transparent']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Crisp glass edge highlight */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: 'rgba(255,255,255,0.28)',
        }}
      />
    </View>
  );
}
