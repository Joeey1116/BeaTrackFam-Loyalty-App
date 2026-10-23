import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen } from '../../components/Screen';
import { ActionRow } from '../../components/ActionRow';
import { awardPoints, getProfile, ONE_TIME_REASONS } from '../../lib/loyalty';
import { useAuth } from '../../lib/auth';

interface EarnAction {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  points: number;
  buttonLabel: string;
  repeatable: boolean;
  run: () => Promise<void>;
}

export default function Earn() {
  const [claimed, setClaimed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Session state comes from AuthProvider — never resolved per-screen.
  // The tabs layout guarantees a signed-in session (build 20); the ''
  // fallback only covers the instant before the guard redirects.
  const { userId } = useAuth();
  const uid = userId ?? '';

  const refresh = useCallback(async () => {
    const profile = await getProfile(uid).catch(() => null);
    setClaimed(profile?.claimedActions ?? []);
  }, [uid]);

  // Load on mount, again whenever the signed-in identity changes, and on
  // every focus — tab screens stay mounted, so a mount-only fetch goes
  // stale the moment the session changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const grant = async (
    actionId: string | null,
    points: number,
    reason: string,
    alreadyMsg?: string,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await awardPoints(uid, points, reason, actionId ? { actionId } : undefined);
      if (result.ok && !result.error) {
        Alert.alert('Nice.', `+${points} pts added. Keep going.`);
      } else if (result.error === 'already-claimed') {
        Alert.alert('Already claimed', alreadyMsg ?? 'You already grabbed these points.');
      } else {
        Alert.alert('Hmm', result.error ?? 'Could not add points. Try again.');
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open the link', 'Try again in a moment.');
    }
  };

  /**
   * Attested claim: the user confirms they actually completed the task.
   * Points are NEVER granted for merely tapping a button — only when the
   * user explicitly confirms completion. (Phase 2: API/webhook verification
   * for purchases via Shopify webhooks, follows via platform APIs.)
   */
  const attestAndGrant = (
    actionId: string,
    points: number,
    reason: string,
    question: string,
  ) => {
    Alert.alert(
      'Confirm',
      question,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Yes, done',
          onPress: () => grant(actionId, points, reason),
        },
      ],
      { cancelable: true },
    );
  };

  const actions: EarnAction[] = [
    {
      id: 'purchase',
      icon: '🛍️',
      title: 'Make a purchase',
      subtitle: 'Shop at beatrackfam.info — 25 pts per order, added automatically after your order is paid.',
      points: 25,
      buttonLabel: 'SHOP',
      repeatable: true,
      run: async () => {
        // Points are NOT granted here. They are credited by the Shopify
        // order webhook (Supabase Edge Function) only after successful
        // payment — see supabase/functions/shopify-order/README.
        try {
          const { openBrowserAsync } = await import('expo-web-browser');
          await openBrowserAsync('https://beatrackfam.info');
        } catch {
          await openLink('https://beatrackfam.info');
        }
      },
    },
    {
      id: 'refer',
      icon: '🤝',
      title: 'Refer a friend',
      subtitle: 'You both get 50 pts when they join with your code.',
      points: 50,
      buttonLabel: 'MY CODE',
      repeatable: true,
      run: async () => router.push('/(tabs)/refer'),
    },
    {
      id: 'follow-ig',
      icon: '📸',
      title: 'Follow on Instagram',
      subtitle: '@beatrackfam — come say hey.',
      points: 20,
      buttonLabel: 'FOLLOW',
      repeatable: false,
      run: async () => {
        await openLink('https://instagram.com/beatrackfam');
        attestAndGrant(
          'follow-ig',
          20,
          ONE_TIME_REASONS['follow-ig'],
          'Did you follow @beatrackfam on Instagram?',
        );
      },
    },
    {
      id: 'follow-tiktok',
      icon: '📱',
      title: 'Follow on TikTok',
      subtitle: '@beatrackfam — the short stuff lives here.',
      points: 20,
      buttonLabel: 'FOLLOW',
      repeatable: false,
      run: async () => {
        await openLink('https://www.tiktok.com/@beatrackfam');
        attestAndGrant(
          'follow-tiktok',
          20,
          ONE_TIME_REASONS['follow-tiktok'],
          'Did you follow @beatrackfam on TikTok?',
        );
      },
    },
    {
      id: 'birthday',
      icon: '🎂',
      title: 'Birthday bonus',
      subtitle: 'Set your birthday in Profile — 100 pts every year.',
      points: 100,
      buttonLabel: 'SET IT',
      repeatable: false,
      run: async () => router.push('/(tabs)/profile'),
    },
    {
      id: 'review',
      icon: '⭐',
      title: 'Write a review',
      subtitle: 'Left a review on a product you copped? Claim it.',
      points: 30,
      buttonLabel: 'CLAIM',
      repeatable: false,
      run: async () =>
        attestAndGrant(
          'review',
          30,
          ONE_TIME_REASONS['review'],
          'Did you leave a review on a product you bought?',
        ),
    },
  ];

  return (
    <Screen>
      <Text style={styles.headline}>EARN POINTS.</Text>
      <Text style={styles.subline}>Every little bit stacks. Thank God for the grind.</Text>
      {actions.map((action) => {
        const isClaimed = !action.repeatable && claimed.includes(action.id);
        return (
          <ActionRow
            key={action.id}
            icon={action.icon}
            title={action.title}
            subtitle={action.subtitle}
            points={action.points}
            buttonLabel={isClaimed ? 'DONE' : action.buttonLabel}
            disabled={isClaimed}
            onPress={action.run}
          />
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headline: { color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: 1, marginTop: 12 },
  subline: { color: '#888888', fontSize: 15, fontStyle: 'italic', marginTop: 6, marginBottom: 20 },
});
