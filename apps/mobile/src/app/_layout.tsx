import "../global.css";

import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic";
import { Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { DevSettings, I18nManager, AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import { authClient } from "@/lib/auth-client";
import { useLocaleStore } from "@/stores/locale";

void SplashScreen.preventAutoHideAsync();

const RTL_APPLIED_KEY = "egx.rtlApplied";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Pause interval polling while the app is in the background.
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener("change", (status) => {
    handleFocus(status === "active");
  });

  return () => subscription.remove();
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [localeReady, setLocaleReady] = useState(false);
  const locale = useLocaleStore((state) => state.locale);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    void useLocaleStore
      .getState()
      .hydrate()
      .catch(() => undefined)
      .finally(() => setLocaleReady(true));
  }, []);

  const ready = (fontsLoaded || Boolean(fontError)) && localeReady && !isPending;

  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const wantsRtl = locale === "ar";
      const applied = await SecureStore.getItemAsync(RTL_APPLIED_KEY).catch(
        () => null,
      );

      if (cancelled) {
        return;
      }

      // forceRTL only takes effect after a native restart, and a JS reload does
      // not update I18nManager.isRTL. Persist the applied locale so we reload at
      // most once per change instead of looping forever.
      if (wantsRtl !== I18nManager.isRTL && applied !== locale) {
        await SecureStore.setItemAsync(RTL_APPLIED_KEY, locale).catch(
          () => undefined,
        );
        I18nManager.allowRTL(wantsRtl);
        I18nManager.forceRTL(wantsRtl);

        if (__DEV__) {
          DevSettings.reload();
          return;
        }
      }

      await SplashScreen.hideAsync();
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, locale]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        backgroundColor: colors.canvas,
        // forceRTL needs a native restart that Expo Go does not perform. Yoga's
        // direction flips row layouts immediately in both Expo Go and builds.
        direction: locale === "ar" ? "rtl" : "ltr",
      }}
    >
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.canvas },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="+not-found" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
