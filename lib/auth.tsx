import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter, useSegments } from 'expo-router';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';
import { isPasswordResetPending, markPasswordResetPending } from './passwordReset';
import { markEmailConfirmedPending, markEmailConfirmationFailed } from './emailConfirmed';
import { applyPendingReferral, ensureProfile } from './loyalty';

/**
 * AuthProvider — the ONE owner of session state (build 18).
 *
 * Why this exists: through build 17, session state had no owner. The
 * startup gate polled getSession() for ~3.2s and then routed forever;
 * every tab resolved the session independently with its own getSession()
 * call; and the deep-link handlers swallowed every failure while still
 * showing the "email confirmed" welcome. When the confirmation handoff
 * failed (see lib/supabase.ts — the client was silently on the implicit
 * flow), the app presented a signed-in-looking demo state and nothing
 * ever recovered.
 *
 * Now: this provider restores the stored session exactly once at launch
 * (processing a cold-start auth deep link first), keeps state current
 * from the client's single onAuthStateChange subscription, drives
 * start/stopAutoRefresh from AppState (the documented RN wiring), and
 * performs the auth-driven navigation reactions. Screens CONSUME state
 * via useAuth(); the gate waits for status instead of polling.
 */

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** Signed-in user's id, or null when signed out. The tabs are
   * session-guarded (build 20) — a null id never reaches a tab screen. */
  userId: string | null;
  /** Signed-in user's email, or null. */
  email: string | null;
  configured: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: 'loading',
  session: null,
  user: null,
  userId: null,
  email: null,
  configured: false,
  signOut: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

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

interface EstablishedSession {
  userId: string;
  email: string;
}

/**
 * Turn deep-link credentials into a real session, or return null.
 * Success is checked on the RESULT — exchangeCodeForSession/setSession
 * report auth failures as a returned error with null data, not a throw,
 * and builds 16/17 treated "no exception" as success.
 */
async function establishSessionFromParams(
  params: Record<string, string>,
): Promise<EstablishedSession | null> {
  if (!supabase) return null;
  try {
    if (params.code) {
      // PKCE flow: the verifier was stored in AsyncStorage when the email
      // was requested (signUp / resend / resetPasswordForEmail). The
      // redirect may carry the flow slot id as sb_flow_id.
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        params.code,
        params.sb_flow_id ? { flowId: params.sb_flow_id } : undefined,
      );
      if (!error && data.session && data.user) {
        return { userId: data.user.id, email: data.user.email ?? '' };
      }
      console.warn(
        '[auth] exchangeCodeForSession did not establish a session:',
        error?.message ?? 'no session in response',
      );
      return null;
    }
    if (params.access_token && params.refresh_token) {
      // Implicit fallback (older emails / links minted before PKCE).
      const { data, error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (!error && data.session && data.user) {
        return { userId: data.user.id, email: data.user.email ?? '' };
      }
      console.warn(
        '[auth] setSession did not establish a session:',
        error?.message ?? 'no session in response',
      );
      return null;
    }
  } catch (err: any) {
    console.warn('[auth] deep-link session setup threw:', err?.message ?? String(err));
    return null;
  }
  if (params.error || params.error_code) {
    console.warn(
      '[auth] deep link carried an error:',
      params.error_code ?? params.error,
      params.error_description ?? '',
    );
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<(string | undefined)[]>(segments as (string | undefined)[]);
  segmentsRef.current = segments as (string | undefined)[];

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const configured = isSupabaseConfigured();

  /* ---- deep-link handlers (defined once, used for cold + warm) ---- */

  const handleResetUrl = async (url: string) => {
    if (!supabase) return;
    markPasswordResetPending();
    await establishSessionFromParams(getUrlParams(url));
    // Warm case the router is ready and we can go straight there; on
    // cold start this may no-op and the gate routes via the flag.
    try {
      router.push('/reset-password');
    } catch {
      // Router not ready yet (cold start) — the gate routes via the flag.
    }
  };

  const handleConfirmedUrl = async (url: string, warm: boolean) => {
    if (!supabase) return;
    const established = await establishSessionFromParams(getUrlParams(url));
    if (!established) {
      // The link did NOT create a session. Do not fake success: no
      // welcome flag, no trip into the tabs. The account itself is
      // usually confirmed server-side by now, so sign-in is the right
      // next step (the gate does this on cold start via the flag).
      markEmailConfirmationFailed();
      if (warm) {
        try {
          router.replace('/sign-in');
        } catch {
          // Router not ready — the signed-out state speaks for itself.
        }
      }
      return;
    }
    try {
      await ensureProfile(established.userId, established.email);
    } catch {
      // Non-fatal: profile self-heals on the next ensureProfile call.
    }
    // A referral code typed at sign-up was stashed (no session existed
    // then) — now that the confirmation created one, apply it.
    try {
      await applyPendingReferral(established.userId);
    } catch {
      // Non-fatal: the stash survives for the next sign-in if this failed.
    }
    // Only NOW is the welcome message honest.
    markEmailConfirmedPending();
    if (warm) {
      try {
        router.replace('/(tabs)');
      } catch {
        // The provider's signed-in reaction routes instead.
      }
    }
  };

  const handleDeepLink = async (url: string, warm: boolean) => {
    if (url.startsWith(RESET_URL_PREFIX)) {
      await handleResetUrl(url);
    } else if (url.startsWith(CONFIRMED_URL_PREFIX)) {
      await handleConfirmedUrl(url, warm);
    }
  };

  /* ---- the single restore + subscription + upkeep effect ---- */

  useEffect(() => {
    if (!configured || !supabase) {
      setStatus('signedOut');
      return;
    }

    // Auto-refresh upkeep: supabase-js refreshes tokens on a JS timer
    // that iOS suspends while the app is backgrounded; the documented
    // React Native wiring drives start/stop from AppState.
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

    // The one subscription. Every auth change flows through here into
    // context state; screens never resolve the session on their own.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setStatus(newSession ? 'signedIn' : 'signedOut');
      if (event === 'PASSWORD_RECOVERY') {
        try {
          router.push('/reset-password');
        } catch {
          // Cold start — the gate routes via the reset flag.
        }
      }
    });

    // Cold-start deep link first (so a confirmation/recovery exchange is
    // part of the restore, not a race against it), then ONE restore read.
    let cancelled = false;
    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && !cancelled) {
          await handleDeepLink(initialUrl, false);
        }
      } catch {
        // No initial URL — a normal launch.
      }
      if (cancelled) return;
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
        setStatus(data.session ? 'signedIn' : 'signedOut');
      } catch {
        if (!cancelled) setStatus('signedOut');
      }
    })();

    // Warm deep links: app already running when the link is tapped.
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void handleDeepLink(url, true);
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      authSub.subscription.unsubscribe();
      linkSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  /* ---- navigation reactions: act on auth TRANSITIONS only ---- */

  const prevStatusRef = useRef<AuthStatus>('loading');
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === status || status === 'loading') return;
    const top = segmentsRef.current[0];
    if (status === 'signedIn') {
      // A session appeared while sitting outside the app proper (gate,
      // onboarding, sign-in/sign-up). Password recovery also creates a
      // session — never hijack that flow into the tabs.
      if (top !== '(tabs)' && top !== 'reset-password' && !isPasswordResetPending()) {
        try {
          router.replace('/(tabs)');
        } catch {
          // Router not ready — the gate routes on the same state.
        }
      }
    } else if (status === 'signedOut') {
      if (top === '(tabs)') {
        try {
          router.replace('/onboarding');
        } catch {
          // Router not ready.
        }
      }
    }
  }, [status, router]);

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    setSession(null);
    setStatus('signedOut');
  };

  const value: AuthContextValue = {
    status,
    session,
    user: session?.user ?? null,
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    configured,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
