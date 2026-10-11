import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  addNotificationTapListener,
  getInitialNotificationTarget,
  setupForegroundPresentation,
  type NotificationTarget,
} from '../lib/notifications';

const TARGET_ROUTES: Record<NotificationTarget, string> = {
  home: '/(tabs)',
  earn: '/(tabs)/earn',
  rewards: '/(tabs)/rewards',
  refer: '/(tabs)/refer',
  profile: '/(tabs)/profile',
};

export default function RootLayout() {
  const router = useRouter();

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
    return unsubscribe;
  }, [router]);

  return (
    <>
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
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
