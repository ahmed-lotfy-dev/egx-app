import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { colors, fonts } from "@/constants/theme";
import { authClient } from "@/lib/auth-client";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function OtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = Array.isArray(params.email) ? params.email[0] : (params.email ?? "");

  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  async function verify() {
    if (code.length !== CODE_LENGTH) {
      return;
    }

    setError(null);
    setVerifying(true);

    const { error: requestError } = await authClient.signIn.emailOtp({
      email,
      otp: code,
    });

    setVerifying(false);

    if (requestError) {
      setError(t("auth.invalidCode"));
      setCode("");
      inputRef.current?.focus();
    }
  }

  async function resend() {
    if (secondsLeft > 0) {
      return;
    }

    setError(null);
    setResending(true);

    const { error: requestError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });

    setResending(false);

    if (requestError) {
      setError(t("auth.errorGeneric"));
      return;
    }

    setSecondsLeft(RESEND_SECONDS);
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-1 px-6 py-6">
          <View className="flex-row items-center justify-between">
            <BrandMark />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface active:opacity-80"
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View className="mt-14">
            <Text className="font-display text-[30px] leading-[38px] text-text">
              {t("auth.otpTitle")}
            </Text>
            <Text className="mt-3 font-body text-[15px] leading-6 text-text-secondary">
              {t("auth.otpSubtitle", { email })}
            </Text>
          </View>

          <Pressable
            className="mt-10 flex-row justify-center gap-2"
            onPress={() => inputRef.current?.focus()}
          >
            <View className="flex-row gap-2" style={{ direction: "ltr" }}>
              {Array.from({ length: CODE_LENGTH }).map((_, index) => {
                const isActive = index === code.length;
                const digit = code[index] ?? "";

                return (
                  <View
                    key={index}
                    className={`h-14 w-12 items-center justify-center rounded-xl border bg-surface ${isActive ? "border-gold" : "border-border"}`}
                  >
                    <Text
                      style={{ fontFamily: fonts.title }}
                      className="text-[22px] text-text"
                    >
                      {digit}
                    </Text>
                  </View>
                );
              })}
            </View>
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={(value) => {
                setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH));
                setError(null);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              autoFocus
              style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            />
          </Pressable>

          {error ? (
            <Text className="mt-4 text-center font-body text-[13px] text-warning">{error}</Text>
          ) : null}

          <View className="mt-8 gap-5">
            <Button
              label={verifying ? t("auth.verifying") : t("auth.verify")}
              onPress={() => void verify()}
              loading={verifying}
              disabled={code.length !== CODE_LENGTH}
            />

            <Pressable
              accessibilityRole="button"
              disabled={secondsLeft > 0 || resending}
              onPress={() => void resend()}
              className="items-center py-2 active:opacity-70"
            >
              <Text
                className={`font-body text-[13px] ${secondsLeft > 0 ? "text-text-muted" : "text-gold"}`}
              >
                {secondsLeft > 0
                  ? t("auth.resendIn", { seconds: secondsLeft })
                  : resending
                    ? t("auth.sendingCode")
                    : t("auth.resend")}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              className="items-center py-1 active:opacity-70"
            >
              <Text className="font-body text-[13px] text-text-secondary">
                {t("auth.changeEmail")}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
