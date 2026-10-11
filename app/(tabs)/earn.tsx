import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen } from '../../components/Screen';
import { ActionRow } from '../../components/ActionRow';
import { awardPoints, DEMO_USER_ID, getProfile, getSessionUserId, ONE_TIME_REASONS } from '../../lib/loyalty';

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
  const [uid, setUid] = useState<string>(DEMO_USER_ID);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const sessionId = await getSessionUserId().catch(() => null);
    const id = sessionId ?? DEMO_USER_ID;
    setUid(id);
    const profile = await getProfile(id).catch(() => null);
    setClaimed(profile?.claimedActions ?? []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  const actions: EarnAction[] = [
    {
      id: 'purchase',
      icon: '🛍️',
      title: 'Make a purchase',
      subtitle: 'Shop at beatrackfam.info — 25 pts per order day, claimed when you check out.',
      points: 25,
      buttonLabel: 'SHOP',
      repeatable: true,
      run: async () => {
        // In-app browser (expo-web-browser). When they close it, offer the
        // daily order claim — one per day, tracked by date-scoped action ID.
        // (v2: replace with automatic Shopify order webhooks.)
        try {
          const { openBrowserAsync } = await import('expo-web-browser');
          await openBrowserAsync('https://beatrackfam.info');
        } catch {
          await openLink('https://beatrackfam.info');
        }
        const today = new Date().toISOString().slice(0, 10);
        await grant(`order-${today}`, 25, 'Order placed at beatrackfam.info', 'One order claim per day — see you tomorrow.');
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
        await grant('follow-ig', 20, ONE_TIME_REASONS['follow-ig']);
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
        await grant('follow-tiktok', 20, ONE_TIME_REASONS['follow-tiktok']);
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
      run: async () => grant('review', 30, ONE_TIME_REASONS['review']),
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
