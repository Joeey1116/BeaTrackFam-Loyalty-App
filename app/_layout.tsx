import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, Platform } from 'react-native';
import {
  addNotificationTapListener,
  getInitialNotificationTarget,
  setupForegroundPresentation,
  type NotificationTarget,
} from '../lib/notifications';
import { AuthProvider } from '../lib/auth';

// Global JS error handler: in release builds a fatal error would otherwise
// kill the app silently. Showing the message lets us diagnose from a
// screenshot instead of guessing.
const _g = globalThis as any;
if (!_g.__btrErrorHandlerInstalled) {
  _g.__btrErrorHandlerInstalled = true;
  const show = (title: string, message: string) => {
    try {
      Alert.alert(title, message.slice(0, 500));
    } catch {
      // Last resort — the error is still logged.
    }
  };
  const prev = _g.ErrorUtils?.getGlobalHandler?.();
  _g.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    if (isFatal) {
      const msg = error?.message ?? String(error);
      const stack = error?.stack ? `\n${String(error.stack).split('\n').slice(0, 4).join('\n')}` : '';
      show('Something broke', `${msg}${stack}\n\nPlease screenshot this and send it to Joey.`);
    }
    try {
      prev?.(error, isFatal);
    } catch {}
  });
  // Also surface unhandled promise rejections in dev logs.
  if (Platform.OS !== 'web' && typeof _g.HermesInternal === 'undefined') {
    // JSC/V8: nothing extra needed.
  }
}

const TARGET_ROUTES: Record<NotificationTarget, string> = {
  home: '/(tabs)',
  earn: '/(tabs)/earn',
  rewards: '/(tabs)/rewards',
  refer: '/(tabs)/refer',
  profile: '/(tabs)/profile',
};

export default function RootLayout() {
  const router = useRouter();

  // Notification taps only. Auth — session restore, deep links, token
  // upkeep, auth-driven navigation — is owned by AuthProvider (lib/auth).
  useEffect(() => {
    setupForegroundPresentation();

    const go = (target: NotificationTarget) => {
      try {
        router.push(TARGET_ROUTES[target] as any);
      } catch {
        // Router not ready yet — the tap is dropped, the user lands on Home.
      }
    };

    // Cold start: app launched from a notification tap.
    getInitialNotificationTarget()
      .then((target) => {
        if (target) setTimeout(() => go(target), 800);
      })
      .catch(() => {});

    // Warm taps: app already running (foreground or background).
    const unsubscribe = addNotificationTapListener(go);

    return () => {
      unsubscribe();
    };
  }, [router]);

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000000' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="privacy-policy" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AuthProvider>
  );
}
