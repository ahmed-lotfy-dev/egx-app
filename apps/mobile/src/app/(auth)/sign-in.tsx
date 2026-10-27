import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors } from "@/constants/theme";
import { authClient } from "@/lib/auth-client";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const googleEnabled = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

// Expo Go cannot handle the app's custom scheme, so send it back through the
// exp:// deep link. Development and release builds use the ahmedlotfy-egx-app:// scheme.
const expoGoHost = Constants.expoGoConfig?.debuggerHost;
const googleCallbackURL = expoGoHost ? `exp://${expoGoHost}/--/` : "/";

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = emailPattern.test(normalizedEmail) && !sending;

  async function sendCode() {
    if (!canSubmit) {
      setError(t("auth.emailInvalid"));
      return;
    }

    setError(null);
    setSending(true);

    const { error: requestError } = await authClient.emailOtp.sendVerificationOtp({
      email: normalizedEmail,
      type: "sign-in",
    });

    setSending(false);

    if (requestError) {
      setError(t("auth.errorGeneric"));
      return;
    }

    router.push({ pathname: "/(auth)/otp", params: { email: normalizedEmail } });
  }

  async function signInWithGoogle() {
    setError(null);
    setGoogleLoading(true);

    const { error: requestError } = await authClient.signIn.social({
      provider: "google",
      callbackURL: googleCallbackURL,
    });

    setGoogleLoading(false);

    if (requestError) {
      setError(t("auth.errorGeneric"));
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 justify-center">
            <BrandMark />

            <View className="mt-12">
              <Text className="font-display text-[34px] leading-[42px] text-text">
                {t("auth.signInTitle")}
              </Text>
              <Text className="mt-3 max-w-[320px] font-body text-[15px] leading-6 text-text-secondary">
                {t("auth.signInSubtitle")}
              </Text>
            </View>

            <View className="mt-10 gap-5">
              <TextField
                label={t("auth.emailLabel")}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError(null);
                }}
                placeholder={t("auth.emailPlaceholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={() => void sendCode()}
                error={error ?? undefined}
              />

              <Button
                label={sending ? t("auth.sendingCode") : t("auth.sendCode")}
                onPress={() => void sendCode()}
                loading={sending}
                disabled={!emailPattern.test(normalizedEmail)}
              />
            </View>

            {googleEnabled ? (
              <>
                <View className="my-7 flex-row items-center gap-4">
                  <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
                  <Text className="font-label text-[10px] uppercase tracking-[0.08em] text-text-muted">
                    {t("common.continue")}
                  </Text>
                  <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
                </View>

                <Button
                  label={t("auth.google")}
                  variant="secondary"
                  onPress={() => void signInWithGoogle()}
                  loading={googleLoading}
                />
              </>
            ) : null}

            <View className="mt-10 flex-row items-center justify-center gap-2">
              <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
              <Text className="font-body text-[12px] text-text-muted">
                {t("auth.kicker")}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
