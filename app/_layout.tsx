import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import {
  addNotificationTapListener,
  getInitialNotificationTarget,
  setupForegroundPresentation,
  type NotificationTarget,
} from '../lib/notifications';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { markPasswordResetPending } from '../lib/passwordReset';
import { markEmailConfirmedPending } from '../lib/emailConfirmed';
import { applyPendingReferral, ensureProfile } from '../lib/loyalty';

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

const RESET_URL_PREFIX = 'beatrackfamrewards://reset-password';
const CONFIRMED_URL_PREFIX = 'beatrackfamrewards://confirmed';

/** Pull query + fragment params out of a deep-link URL. */
function getUrlParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const qIndex = url.indexOf('?');
  const hIndex = url.indexOf('#');
  const query = qIndex >= 0 ? url.slice(qIndex + 1, hIndex >= 0 ? hIndex : undefined) : '';
  const fragment = hIndex >= 0 ? url.slice(hIndex + 1) : '';
  for (const part of `${query}&${fragment}`.split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      params[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
    }
  }
  return params;
}

/**
 * Handle an incoming password-reset deep link: flag it so the auth gate
 * routes to the reset screen, exchange the recovery code/token for a
 * session, and navigate there directly when the router is ready
 * (warm case). On cold start the auth gate picks up the flag.
 */
async function handlePasswordResetUrl(url: string, router: ReturnType<typeof useRouter>) {
  if (!isSupabaseConfigured() || !supabase) return;
  markPasswordResetPending();
  try {
    const params = getUrlParams(url);
    if (params.code) {
      // PKCE flow (supabase-js v2 default).
      await supabase.auth.exchangeCodeForSession(params.code);
    } else if (params.access_token && params.refresh_token) {
      // Implicit flow fallback.
      await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
    }
  } catch {
    // The reset screen shows the invalid/expired state when no session exists.
  }
  try {
    router.push('/reset-password');
  } catch {
    // Router not ready yet (cold start) — the auth gate routes via the flag.
  }
}

/**
 * Handle an incoming signup-confirmation deep link: exchange the
 * confirmation code/token for a session, make sure the loyalty profile
 * exists (same as the sign-in flow), flag the one-time welcome message,
 * and land in the main app. On cold start the auth gate routes via the
 * session once the exchange completes.
 */
async function handleConfirmedUrl(url: string, router: ReturnType<typeof useRouter>) {
  if (!isSupabaseConfigured() || !supabase) return;
  markEmailConfirmedPending();
  try {
    const params = getUrlParams(url);
    let userId: string | null = null;
    let userEmail = '';
    if (params.code) {
      // PKCE flow (supabase-js v2 default).
      const { data } = await supabase.auth.exchangeCodeForSession(params.code);
      userId = data.user?.id ?? null;
      userEmail = data.user?.email ?? '';
    } else if (params.access_token && params.refresh_token) {
      // Implicit flow fallback.
      const { data } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      userId = data.user?.id ?? null;
      userEmail = data.user?.email ?? '';
    }
    if (userId) {
      try {
        await ensureProfile(userId, userEmail);
      } catch {
        // Non-fatal: the home tab shows a signed-in state regardless.
      }
      // A referral code typed at sign-up was stashed (no session existed
      // then) — now that the confirmation created one, apply it.
      try {
        await applyPendingReferral(userId);
      } catch {
        // Non-fatal: the stash survives for the next sign-in if this failed.
      }
    }
  } catch {
    // No session established — the tabs still load; the welcome message is skipped.
  }
  try {
    router.push('/(tabs)');
  } catch {
    // Router not ready yet (cold start) — the auth gate routes via the session.
  }
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>(segments as string[]);
  segmentsRef.current = segments as string[];

  // Session upkeep + auth-state navigation. Two React Native gaps live here:
  //
  // 1. Auto-refresh: supabase-js refreshes tokens on a JS timer that iOS
  //    suspends while the app is backgrounded. Supabase's React Native guide
  //    requires driving start/stopAutoRefresh from AppState — without it the
  //    stored session silently goes stale between restarts and the user
  //    lands back on onboarding ("doesn't keep me logged in").
  // 2. Auth changes: nothing else in the app listened for them, so a session
  //    created by the email-confirmation deep link (or any sign-in) after
  //    screens had mounted never became visible until the app was
  //    force-closed and everything remounted. On SIGNED_IN outside the tabs,
  //    route into the app; on SIGNED_OUT inside the tabs, route out.
  //    Password recovery also creates a session — never hijack that screen.
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    if (AppState.currentState === 'active') {
      supabase.auth.startAutoRefresh();
    }
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (!supabase) return;
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      const top = segmentsRef.current[0];
      const inTabs = top === '(tabs)';
      if (event === 'SIGNED_IN' && session) {
        if (top === 'reset-password') return;
        if (!inTabs) {
          try {
            router.replace('/(tabs)');
          } catch {
            // Router not ready yet — the auth gate routes on the session.
          }
        }
      } else if (event === 'SIGNED_OUT' && inTabs) {
        try {
          router.replace('/onboarding');
        } catch {
          // Router not ready yet.
        }
      }
    });

    return () => {
      appStateSub.remove();
      authSub.subscription.unsubscribe();
    };
  }, [router]);

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

    // Password-reset deep links.
    // Cold start: app launched from the reset link in the email.
    Linking.getInitialURL()
      .then((url) => {
        if (url && url.startsWith(RESET_URL_PREFIX)) {
          handlePasswordResetUrl(url, router);
        } else if (url && url.startsWith(CONFIRMED_URL_PREFIX)) {
          handleConfirmedUrl(url, router);
        }
      })
      .catch(() => {});

    // Warm: link opened while the app is already running.
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith(RESET_URL_PREFIX)) {
        handlePasswordResetUrl(url, router);
      } else if (url.startsWith(CONFIRMED_URL_PREFIX)) {
        handleConfirmedUrl(url, router);
      }
    });

    return () => {
      unsubscribe();
      linkSub.remove();
    };
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
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="privacy-policy" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
