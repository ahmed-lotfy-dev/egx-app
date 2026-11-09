import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { colors, tabular } from "@/constants/theme";
import {
  adminApi,
  datesFromFilename,
  type AdminDocument,
} from "@/lib/admin-api";
import { formatDateWithYear } from "@/lib/format";

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  uploaded: { bg: "bg-surface-elevated", text: "text-text-secondary", dot: colors.textSecondary },
  extracting: { bg: "bg-surface-elevated", text: "text-gold", dot: colors.gold },
  extracted: { bg: "bg-surface-elevated", text: "text-text", dot: colors.text },
  validating: { bg: "bg-surface-elevated", text: "text-warning", dot: colors.warning },
  validated: { bg: "bg-surface-elevated", text: "text-up", dot: colors.up },
  failed: { bg: "bg-surface-elevated", text: "text-down", dot: colors.down },
  published: { bg: "bg-surface-elevated", text: "text-up", dot: colors.up },
};

function StatusChip({ status }: { status: string }) {
  const { t } = useTranslation();
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.uploaded!;

  return (
    <View
      className={`flex-row items-center gap-1.5 rounded-full px-2.5 py-1 ${style.bg}`}
    >
      <View
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: style.dot }}
      />
      <Text className={`font-body text-[11px] ${style.text}`}>
        {t(`admin.status.${status}`, { defaultValue: status })}
      </Text>
    </View>
  );
}

function SummaryCell({
  label,
  value,
  tone = "text-text",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <View className="flex-1 items-center">
      <Text className={`font-display text-[20px] ${tone}`} style={tabular}>
        {value}
      </Text>
      <Text className="mt-0.5 font-body text-[11px] text-text-muted">{label}</Text>
    </View>
  );
}

export default function AdminDocumentsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [pickedFile, setPickedFile] = useState<{
    uri: string;
    name: string;
    mimeType?: string;
  } | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const documentsQuery = useQuery({
    queryKey: ["admin", "documents"],
    queryFn: () => adminApi.list(),
    staleTime: 15_000,
  });

  const documents = documentsQuery.data?.data ?? [];

  const counts = documents.reduce(
    (acc, doc) => {
      acc.total += 1;
      if (doc.status === "validated") acc.validated += 1;
      if (doc.status === "published") acc.published += 1;
      if (doc.status === "failed") acc.failed += 1;
      return acc;
    },
    { total: 0, validated: 0, published: 0, failed: 0 },
  );

  const uploadMutation = useMutation({
    mutationFn: () =>
      adminApi.upload(pickedFile!, { periodStart, periodEnd }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
      setUploadOpen(false);
      setPickedFile(null);
      setPeriodStart("");
      setPeriodEnd("");
      
      // Auto-trigger extraction after upload
      const documentId = result.data?.id;
      if (documentId) {
        try {
          await adminApi.extract(documentId);
        } catch (e) {
          console.warn("Auto-extract failed:", e);
        }
      }
      
      Alert.alert(t("admin.documents.done"), t("admin.documents.uploaded"));
    },
    onError: (error: Error) =>
      Alert.alert(t("admin.documents.failed"), error.message),
  });

  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setPickedFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
    });

    const detected = datesFromFilename(asset.name);
    if (detected) {
      setPeriodStart(detected.periodStart);
      setPeriodEnd(detected.periodEnd);
    }
  }

  function openUpload() {
    setPickedFile(null);
    setPeriodStart("");
    setPeriodEnd("");
    setUploadOpen(true);
  }

  function confirmUpload() {
    if (!pickedFile) {
      Alert.alert(t("admin.documents.failed"), t("admin.documents.pickFile"));
      return;
    }
    if (!isDate(periodStart) || !isDate(periodEnd)) {
      Alert.alert(t("admin.documents.failed"), t("admin.documents.dateFormat"));
      return;
    }
    if (periodStart > periodEnd) {
      Alert.alert(t("admin.documents.failed"), t("admin.documents.dateOrder"));
      return;
    }
    uploadMutation.mutate();
  }

  return (
    <Screen>
      <ScreenHeader
        kicker={t("admin.documents.kicker")}
        title={t("admin.documents.title")}
        right={
          <Pressable
            accessibilityRole="button"
            onPress={openUpload}
            className="flex-row items-center gap-1.5 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 active:opacity-80"
          >
            <Ionicons name="cloud-upload-outline" size={16} color={colors.gold} />
            <Text className="font-title text-[12px] text-gold">
              {t("admin.documents.upload")}
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={documentsQuery.isRefetching}
            onRefresh={() => {
              void documentsQuery.refetch();
            }}
            tintColor={colors.gold}
          />
        }
      >
        <View className="mx-5 flex-row rounded-2xl border border-border bg-surface px-3 py-4">
          <SummaryCell label={t("admin.documents.total")} value={counts.total} />
          <View className="w-px bg-border" />
          <SummaryCell
            label={t("admin.documents.validatedCount")}
            value={counts.validated}
            tone="text-up"
          />
          <View className="w-px bg-border" />
          <SummaryCell
            label={t("admin.documents.publishedCount")}
            value={counts.published}
            tone="text-gold"
          />
          <View className="w-px bg-border" />
          <SummaryCell
            label={t("admin.documents.failedCount")}
            value={counts.failed}
            tone={counts.failed > 0 ? "text-down" : "text-text-muted"}
          />
        </View>

        <View className="mx-5 mt-6">
          <Text className="font-label text-[10px] uppercase tracking-[0.14em] text-text-muted">
            {t("admin.documents.all")}
          </Text>
        </View>

        {documentsQuery.isPending ? (
          <View className="items-center py-16">
            <ActivityIndicator color={colors.gold} />
            <Text className="mt-3 font-body text-[13px] text-text-secondary">
              {t("common.loading")}
            </Text>
          </View>
        ) : documentsQuery.isError ? (
          <View className="mx-5 mt-4 items-center rounded-2xl border border-border bg-surface py-8">
            <Text className="font-body text-[13px] text-text-secondary">
              {t("admin.documents.loadFailed")}
            </Text>
            <View className="mt-3">
              <Button
                label={t("common.retry")}
                variant="secondary"
                onPress={() => void documentsQuery.refetch()}
              />
            </View>
          </View>
        ) : documents.length === 0 ? (
          <View className="mx-5 mt-4 items-center rounded-2xl border border-border bg-surface px-6 py-10">
            <Ionicons
              name="document-text-outline"
              size={40}
              color={colors.textMuted}
            />
            <Text className="mt-3 font-title text-[14px] text-text">
              {t("admin.documents.empty")}
            </Text>
            <Text className="mt-1 text-center font-body text-[12px] leading-5 text-text-muted">
              {t("admin.documents.emptyDesc")}
            </Text>
          </View>
        ) : (
          <View className="mx-5 mt-3">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onPress={() => router.push(`/admin/documents/${doc.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={uploadOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setUploadOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="rounded-t-3xl border-t border-border bg-surface px-5 pb-8 pt-5">
            <View className="flex-row items-center justify-between">
              <Text className="font-display text-[20px] text-text">
                {t("admin.documents.uploadTitle")}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setUploadOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full bg-surface-elevated active:opacity-80"
              >
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text className="mt-1 font-body text-[12px] leading-5 text-text-muted">
              {t("admin.documents.uploadHint")}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => void pickFile()}
              className="mt-4 flex-row items-center gap-3 rounded-2xl border border-dashed border-border bg-canvas px-4 py-4 active:opacity-80"
            >
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface-elevated">
                <Ionicons name="document-attach-outline" size={18} color={colors.gold} />
              </View>
              <View className="flex-1">
                <Text className="font-title text-[13px] text-text">
                  {pickedFile ? pickedFile.name : t("admin.documents.pickFile")}
                </Text>
                <Text className="mt-0.5 font-body text-[11px] text-text-muted">
                  PDF
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>

            <View className="mt-4 flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1.5 font-label text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  {t("admin.documents.periodStart")}
                </Text>
                <TextInput
                  value={periodStart}
                  onChangeText={setPeriodStart}
                  placeholder="2025-10-01"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  className="rounded-xl border border-border bg-canvas px-3 py-2.5 font-body text-[13px] text-text"
                />
              </View>
              <View className="flex-1">
                <Text className="mb-1.5 font-label text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  {t("admin.documents.periodEnd")}
                </Text>
                <TextInput
                  value={periodEnd}
                  onChangeText={setPeriodEnd}
                  placeholder="2025-12-31"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  className="rounded-xl border border-border bg-canvas px-3 py-2.5 font-body text-[13px] text-text"
                />
              </View>
            </View>

            <View className="mt-5">
              <Button
                label={
                  uploadMutation.isPending
                    ? t("admin.documents.uploading")
                    : t("admin.documents.confirmUpload")
                }
                loading={uploadMutation.isPending}
                onPress={confirmUpload}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function DocumentCard({
  document,
  onPress,
}: {
  document: AdminDocument;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="mb-3 rounded-2xl border border-border bg-surface p-4 active:opacity-80"
    >
      <View className="flex-row items-start">
        <View className="flex-1 pr-3">
          <Text className="font-title text-[13px] leading-5 text-text" numberOfLines={2}>
            {document.filename}
          </Text>

          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <StatusChip status={document.status} />
            <Text className="font-body text-[11px] text-text-muted" style={tabular}>
              {document.pages} {t("admin.documents.pages")}
            </Text>
          </View>

          <Text className="mt-2 font-body text-[11px] text-text-muted" style={tabular}>
            {document.periodStart && document.periodEnd
              ? `${document.periodStart} → ${document.periodEnd}`
              : "—"}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}