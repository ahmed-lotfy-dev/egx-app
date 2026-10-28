import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { colors, fonts } from "@/constants/theme";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, focusedName: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={size} color={color as string} />
  );
}

/**
 * The default tab bar height is a fixed 49dp + bottom inset. Our labels (11sp
 * Arabic font) plus the icon and paddings need ~56dp, so on devices with
 * larger font metrics the label row overflows and gets clipped. Reserve the
 * height the content actually needs; the inset padding below is still applied
 * by the navigator itself.
 */
const TAB_BAR_CONTENT_HEIGHT = 62;

export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.body,
          fontSize: 11,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.markets"),
          tabBarIcon: tabIcon("pulse-outline", "pulse"),
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: t("tabs.stocks"),
          tabBarIcon: tabIcon("bookmark-outline", "bookmark"),
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: t("tabs.news"),
          tabBarIcon: tabIcon("newspaper-outline", "newspaper"),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: t("tabs.ai"),
          tabBarIcon: tabIcon("sparkles-outline", "sparkles"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: tabIcon("person-circle-outline", "person-circle"),
        }}
      />
    </Tabs>
  );
}
