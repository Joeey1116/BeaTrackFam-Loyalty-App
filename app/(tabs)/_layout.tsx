import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassTabBackground } from '../../components/GlassTabBackground';

const ICONS: Record<string, [string, string]> = {
  index: ['home-outline', 'home'],
  earn: ['star-outline', 'star'],
  rewards: ['gift-outline', 'gift'],
  refer: ['people-outline', 'people'],
  profile: ['person-outline', 'person'],
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => {
        const [outline, filled] = ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
        return {
          headerShown: false,
          tabBarBackground: () => <GlassTabBackground />,
          tabBarStyle: { backgroundColor: 'transparent', borderTopColor: '#1f1f1f', borderTopWidth: 1, position: 'absolute' },
          tabBarActiveTintColor: '#ffffff',
          tabBarInactiveTintColor: '#666666',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={(focused ? filled : outline) as any} size={size} color={color} />
          ),
        };
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="earn" options={{ title: 'Earn' }} />
      <Tabs.Screen name="rewards" options={{ title: 'Rewards' }} />
      <Tabs.Screen name="refer" options={{ title: 'Refer' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
