import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Frosted-glass tab-bar background.
 *
 * Uses expo-blur's BlurView as the primary implementation (reliable across
 * builds) layered with a light sheen and edge highlight so the bar reads
 * as glass. BlurView fails gracefully to its backgroundColor if the native
 * module is ever unavailable, so the bar never breaks.
 */
export function GlassTabBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={85}
        tint="dark"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(28,12,36,0.45)' }]}
      />
      {/* Light sheen catching the top of the glass */}
      <LinearGradient
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.03)', 'transparent']}
        locations={[0, 0.4, 1]}
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
          backgroundColor: 'rgba(255,255,255,0.35)',
        }}
      />
    </View>
  );
}
