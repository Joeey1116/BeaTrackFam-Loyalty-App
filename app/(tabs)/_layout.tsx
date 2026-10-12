import { NativeTabs } from 'expo-router/unstable-native-tabs';

/**
 * Bottom navigation is the OS's OWN tab bar (UITabBar on iOS, the
 * Material navigation bar on Android) — the same as the main BeaTrackFam
 * app. On iOS 26+ the system draws it as the floating Liquid Glass
 * capsule, the genuine article rendered by Apple, not an imitation.
 */
export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor="#ffffff"
      iconColor={{ default: '#666666', selected: '#ffffff' }}
      labelStyle={{
        default: { color: '#666666', fontWeight: '500' },
        selected: { color: '#ffffff', fontWeight: '700' },
      }}
    >
      <NativeTabs.Trigger name="index" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md="home"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="earn" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>Earn</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'star', selected: 'star.fill' }}
          md="star"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rewards" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>Rewards</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gift', selected: 'gift.fill' }}
          md="card_giftcard"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="refer" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>Refer</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.2', selected: 'person.2.fill' }}
          md="group"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="person"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
