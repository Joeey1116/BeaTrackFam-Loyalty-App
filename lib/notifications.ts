/**
 * Push-notification registration + deep-link tap handling for BeaTrackFam Rewards.
 *
 * Crash-safety: expo-notifications is NEVER statically imported in launch-path
 * files. It is loaded lazily with a dynamic import inside try/catch, so a
 * missing or broken native module can never redbox the app at startup.
 *
 * Deep-link contract: every push we send carries data.target, one of
 * 'home' | 'earn' | 'rewards' | 'refer' | 'profile'. Taps route to
 * /(tabs)/<target>. Examples:
 *   - new reward available  -> { target: 'rewards' }
 *   - points earned          -> { target: 'home' }
 *   - referral joined        -> { target: 'refer' }
 */

export type NotificationTarget = 'home' | 'earn' | 'rewards' | 'refer' | 'profile';

const VALID_TARGETS: NotificationTarget[] = ['home', 'earn', 'rewards', 'refer', 'profile'];

function toTarget(value: unknown): NotificationTarget | null {
  return typeof value === 'string' && (VALID_TARGETS as string[]).includes(value)
    ? (value as NotificationTarget)
    : null;
}

let pushToken: string | null = null;
let androidChannelSet = false;

async function ensureAndroidChannel(Notifications: any): Promise<void> {
  if (androidChannelSet) return;
  try {
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('rewards', {
      name: 'Rewards & drops',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFFFFF',
    });
    androidChannelSet = true;
  } catch {
    // Non-fatal — notifications still work on the default channel.
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (pushToken) return pushToken;

  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');

    if (!Device.isDevice) return null;

    await ensureAndroidChannel(Notifications);

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    // Only ever show the native dialog when the user hasn't decided yet.
    // Re-prompting after a denial is both annoying and a native crash risk.
    if (existingStatus === 'undetermined') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // NOTE (Oct 2026): no EAS project exists (projectId is the zero UUID),
    // so Expo push tokens can never work in this build setup. Use the raw
    // APNs/FCM device token instead — a future push backend can use it.
    const token = (await Notifications.getDevicePushTokenAsync()).data;

    pushToken = token ?? null;
    return pushToken;
  } catch {
    return null;
  }
}

/** Persist the push token on the user's profile (needs the push_token column). */
export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    const { isSupabaseConfigured, supabase } = await import('./supabase');
    if (!isSupabaseConfigured() || !supabase) return;
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  } catch {
    // Non-fatal — the app works without a stored token.
  }
}

/**
 * Listen for notification taps (foreground + background). Returns an
 * unsubscribe function. The callback receives the deep-link target.
 */
export function addNotificationTapListener(
  onTap: (target: NotificationTarget) => void,
): () => void {
  let subscription: { remove: () => void } | null = null;
  (async () => {
    try {
      const Notifications = await import('expo-notifications');
      subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
        const target = toTarget(response?.notification?.request?.content?.data?.target);
        if (target) onTap(target);
      });
    } catch {
      // Notifications unavailable — nothing to listen to.
    }
  })();
  return () => {
    try {
      subscription?.remove();
    } catch {
      // Already gone.
    }
  };
}

/** Cold-start case: the app was launched by tapping a notification. */
export async function getInitialNotificationTarget(): Promise<NotificationTarget | null> {
  try {
    const Notifications = await import('expo-notifications');
    const response = await Notifications.getLastNotificationResponseAsync();
    return toTarget(response?.notification?.request?.content?.data?.target);
  } catch {
    return null;
  }
}

/** Foreground presentation: show a banner + play sound while the app is open. */
export function setupForegroundPresentation(): void {
  (async () => {
    try {
      const Notifications = await import('expo-notifications');
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    } catch {
      // Notifications unavailable.
    }
  })();
}
