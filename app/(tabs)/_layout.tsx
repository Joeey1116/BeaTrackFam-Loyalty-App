import React from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useAuth } from "../../lib/auth";

/**
 * Bottom navigation is the OS's OWN tab bar (UITabBar on iOS, the
 * Material navigation bar on Android) instead of a hand-drawn pill.
 * On iOS 26 the system draws it as the floating Liquid Glass capsule —
 * the genuine article, rendered by Apple, not an imitation.
 * (Ported Oct 15, 2026 from the main BeaTrackFam app's proven setup,
 * same expo-router/react-native-screens versions.)
 *
 * Session guard (build 20): the tabs exist ONLY behind a real signed-in
 * session — guest/offline mode was removed entirely. Any route that
 * lands here without one (a stale deep link, a direct navigation, the
 * moment after sign-out or account deletion) is bounced to onboarding,
 * whose only exits are sign-up and sign-in. While the provider is still
 * restoring the session, render the black backdrop instead of flashing
 * either the tabs or a redirect.
 */
export default function TabsLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return <View style={{ flex: 1, backgroundColor: "#000000" }} />;
  }
  if (status !== "signedIn") {
    return <Redirect href="/onboarding" />;
  }

  return (
    <NativeTabs
      tintColor="#ffffff"
      iconColor={{ default: "#666666", selected: "#ffffff" }}
      labelStyle={{
        default: { color: "#666666", fontWeight: "500" },
        selected: { color: "#ffffff", fontWeight: "700" },
      }}
    >
      <NativeTabs.Trigger
        name="index"
        contentStyle={{ backgroundColor: "#000000" }}
        disableTransparentOnScrollEdge
      >
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md="home"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="earn"
        contentStyle={{ backgroundColor: "#000000" }}
        disableTransparentOnScrollEdge
      >
        <NativeTabs.Trigger.Label>Earn</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "star", selected: "star.fill" }}
          md="star"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="rewards"
        contentStyle={{ backgroundColor: "#000000" }}
        disableTransparentOnScrollEdge
      >
        <NativeTabs.Trigger.Label>Rewards</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "gift", selected: "gift.fill" }}
          md="redeem"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="refer"
        contentStyle={{ backgroundColor: "#000000" }}
        disableTransparentOnScrollEdge
      >
        <NativeTabs.Trigger.Label>Refer</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.2", selected: "person.2.fill" }}
          md="group"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="profile"
        contentStyle={{ backgroundColor: "#000000" }}
        disableTransparentOnScrollEdge
      >
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "person.crop.circle",
            selected: "person.crop.circle.fill",
          }}
          md="person"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
