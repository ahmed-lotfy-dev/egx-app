import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { colors } from "@/constants/theme";
import { api } from "@/lib/api";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
};

/** NIM answers in markdown; the app renders plain text, so drop the markers. */
function plainText(content: string): string {
  return content.replace(/\*\*/g, "").trim();
}

export default function AiScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ticker?: string; q?: string }>();

  // A thread is scoped to its grounding: opening the tab with a stock starts
  // a fresh conversation about that stock; clearing the chip goes market-wide.
  const [ticker, setTicker] = useState<string | undefined>(
    params.ticker ? params.ticker.toUpperCase() : undefined,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [errorHint, setErrorHint] = useState(false);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const lastNavKey = useRef("");

  const locale = i18n.language.startsWith("ar") ? "ar" : "en";

  const sendMutation = useMutation({
    mutationFn: async (history: ChatMessage[]) => {
      const { data, error } = await api.POST("/api/ai/chat", {
        body: {
          messages: history.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          ...(ticker ? { ticker } : {}),
          locale,
        },
      });
      if (error) {
        throw new Error("code" in error ? String(error.code) : "request failed");
      }
      return data;
    },
    onSuccess: (data) => {
      setErrorHint(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: plainText(data.data.message.content) },
      ]);
    },
    onError: () => {
      setErrorHint(true);
    },
  });

  const sending = sendMutation.isPending;

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || sending) {
      return;
    }
    setErrorHint(false);
    setInput("");
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    sendMutation.mutate(history);
  };

  const retry = () => {
    if (messages.length === 0) return;
    setErrorHint(false);
    sendMutation.mutate(messages);
  };

  const resetChat = () => {
    if (sending) return;
    setErrorHint(false);
    setMessages([]);
  };

  // Arriving from a stock detail starts a grounded thread about that stock,
  // and an optional `q` param (tapped suggestion) fires immediately.
  useEffect(() => {
    const nextTicker = params.ticker ? params.ticker.toUpperCase() : undefined;
    const navKey = `${nextTicker ?? ""}|${params.q ?? ""}`;
    if (navKey === lastNavKey.current) return;
    lastNavKey.current = navKey;
    setTicker(nextTicker);
    setMessages([]);
    setErrorHint(false);
    const text = params.q?.trim();
    if (text) {
      const history: ChatMessage[] = [{ role: "user", content: text }];
      setMessages(history);
      sendMutation.mutate(history);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ticker, params.q]);

  useEffect(() => {
    // Keep the newest message visible as the conversation grows.
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages, sending]);

  const suggestions = ticker
    ? [
        t("ai.suggestTickerQuote", { ticker }),
        t("ai.suggestTickerNews", { ticker }),
        t("ai.suggestTickerLevels", { ticker }),
      ]
    : [
        t("ai.suggestMarket"),
        t("ai.suggestDollar"),
        t("ai.suggestTop"),
        t("ai.suggestHelp"),
      ];

  const renderBubble = (message: ChatMessage, index: number) => {
    const isUser = message.role === "user";
    return (
      <View
        key={`${index}-${message.role}`}
        className={`px-5 ${isUser ? "items-end" : "items-start"}`}
      >
        <View
          className={`max-w-[85%] rounded-2xl border px-4 py-3 ${
            isUser
              ? "border-gold/30 bg-gold/10"
              : message.failed
                ? "border-down/40 bg-down/10"
                : "border-border bg-surface"
          }`}
        >
          <Text
            className={`font-body text-[14px] leading-6 ${
              isUser ? "text-text" : message.failed ? "text-down" : "text-text"
            }`}
          >
            {message.content}
          </Text>
        </View>
      </View>
    );
  };

  const hasMessages = messages.length > 0;

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScreenHeader
          title={t("ai.title")}
          right={
            hasMessages ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ai.newChat")}
                hitSlop={8}
                onPress={resetChat}
                className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
              >
                <Ionicons name="add" size={20} color={colors.gold} />
              </Pressable>
            ) : null
          }
        />

        {ticker ? (
          <View className="flex-row items-center px-5 pb-2">
            <View className="flex-row items-center gap-2 rounded-full border border-gold/30 bg-gold/10 py-1.5 pl-1 pr-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ai.clearContext")}
                hitSlop={8}
                onPress={() => setTicker(undefined)}
                className="h-5 w-5 items-center justify-center rounded-full bg-gold/20"
              >
                <Ionicons name="close" size={12} color={colors.gold} />
              </Pressable>
              <Text className="font-title text-[12px] text-gold">{ticker}</Text>
            </View>
          </View>
        ) : null}

        {hasMessages || sending ? (
          <FlatList
            ref={listRef}
            data={sending ? [...messages, { role: "assistant" as const, content: "__typing__" }] : messages}
            keyExtractor={(_, index) => String(index)}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            contentContainerStyle={{ paddingBottom: 12, gap: 10, paddingTop: 4 }}
            renderItem={({ item, index }) =>
              item.content === "__typing__" ? (
                <View className="items-start px-5">
                  <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
                    <ActivityIndicator size="small" color={colors.gold} />
                    <Text className="font-body text-[13px] text-text-muted">
                      {t("ai.typing")}
                    </Text>
                  </View>
                </View>
              ) : (
                renderBubble(item, index)
              )
            }
          />
        ) : (
          <FlatList
            data={[]}
            keyExtractor={(_, index) => String(index)}
            contentContainerStyle={{ flexGrow: 1 }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center px-6">
                <View className="h-14 w-14 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10">
                  <Ionicons name="sparkles" size={26} color={colors.gold} />
                </View>
                <Text className="mt-4 text-center font-title text-[19px] text-text">
                  {t("ai.greeting")}
                </Text>
                <Text className="mt-2 max-w-[320px] text-center font-body text-[14px] leading-6 text-text-secondary">
                  {t("ai.greetingBody")}
                </Text>
                <View className="mt-6 flex-row flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      accessibilityRole="button"
                      onPress={() => send(suggestion)}
                      className="rounded-full border border-border bg-surface px-4 py-2.5 active:opacity-80"
                    >
                      <Text className="font-body text-[13px] text-text-secondary">
                        {suggestion}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="mt-8 max-w-[320px] text-center font-body text-[11px] leading-5 text-text-muted">
                  {t("stock.aiDisclaimer")}
                </Text>
              </View>
            }
          />
        )}

        {errorHint ? (
          <View className="mx-5 mb-2 flex-row items-center gap-3 rounded-2xl border border-down/40 bg-down/10 px-4 py-2.5">
            <Text className="flex-1 font-body text-[12px] text-down">{t("ai.error")}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              className="rounded-full border border-down/40 px-3 py-1.5"
            >
              <Text className="font-title text-[12px] text-down">{t("common.retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        <View
          className="flex-row items-end gap-2 border-t border-border/60 bg-canvas px-3 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("ai.inputPlaceholder")}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            blurOnSubmit={false}
            className="min-h-11 flex-1 rounded-2xl border border-border bg-surface px-4 font-body text-[15px] text-text"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("ai.send")}
            disabled={!input.trim() || sending}
            onPress={() => send(input)}
            className={`h-11 w-11 items-center justify-center rounded-2xl bg-gold ${
              !input.trim() || sending ? "opacity-40" : "active:opacity-80"
            }`}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.canvas} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.canvas} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
