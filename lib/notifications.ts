/**
 * Push-notification registration for BeaTrackFam Rewards.
 *
 * Crash-safety: expo-notifications is NEVER statically imported in launch-path
 * files. It is loaded lazily with a dynamic import inside try/catch, so a
 * missing or broken native module can never redbox the app at startup.
 */

let pushToken: string | null = null;

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (pushToken) return pushToken;

  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');
    const Constants = await import('expo-constants');

    if (!Device.isDevice) return null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // Project ID is only needed for Expo push service on a dev client.
    const projectId =
      Constants.default?.expoConfig?.extra?.eas?.projectId ??
      Constants.default?.easConfig?.projectId;
    const token = projectId
      ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
      : (await Notifications.getDevicePushTokenAsync()).data;

    pushToken = token ?? null;
    return pushToken;
  } catch {
    return null;
  }
}
