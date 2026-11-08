import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { colors, tabular } from "@/constants/theme";
import {
  adminApi,
  type AdminDocument,
  type AdminDocumentRow,
} from "@/lib/admin-api";
import { formatDateWithYear, formatPrice } from "@/lib/format";

const STATUS_TONE: Record<string, string> = {
  uploaded: colors.textSecondary,
  extracting: colors.gold,
  extracted: colors.text,
  validating: colors.warning,
  validated: colors.up,
  failed: colors.down,
  published: colors.up,
};

function methodFromNote(note: string | null): string | null {
  if (!note) return null;
  const match = note.match(/method":"([^"]+)"/);
  return match?.[1] ?? null;
}

/**
 * `review_note` is a "; "-joined list of failed checks, each shaped like
 * `market_cap_mismatch: {"calc":…}`. Only the check name is useful to the
 * reader, so the raw JSON payload is dropped.
 */
function failedChecks(note: string | null): string[] {
  if (!note) return [];

  return note
    .split(";")
    .map((part) => part.slice(0, part.indexOf(":")).trim())
    .filter((name) => name.length > 0);
}

export default function AdminDocumentDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const detailQuery = useQuery({
    queryKey: ["admin", "documents", id],
    queryFn: () => adminApi.detail(id),
    enabled: Boolean(id),
    staleTime: 10_000,
  });

  const detail = detailQuery.data?.data;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
  };

  const publishMutation = useMutation({
    mutationFn: () => adminApi.publish(id),
    onSuccess: async (res) => {
      await invalidate();
      await detailQuery.refetch();
      Alert.alert(
        t("admin.documents.done"),
        t("admin.documents.publishResult", {
          published: res.data.published,
          skipped: res.data.skippedUnmatched,
        }),
      );
    },
    onError: (error: Error) =>
      Alert.alert(t("admin.documents.failed"), error.message),
  });

  const extractMutation = useMutation({
    mutationFn: () => adminApi.extract(id),
    onSuccess: async () => {
      await invalidate();
      await detailQuery.refetch();
      Alert.alert(t("admin.documents.done"), t("admin.documents.reExtractStarted"));
    },
    onError: (error: Error) =>
      Alert.alert(t("admin.documents.failed"), error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.remove(id),
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
    onError: (error: Error) =>
      Alert.alert(t("admin.documents.failed"), error.message),
  });

  function confirmPublish() {
    Alert.alert(
      t("admin.documents.publishTitle"),
      t("admin.documents.publishBody"),
      [
        { text: t("admin.documents.cancel"), style: "cancel" },
        {
          text: t("admin.documents.publish"),
          onPress: () => publishMutation.mutate(),
        },
      ],
    );
  }

  function confirmReExtract() {
    Alert.alert(
      t("admin.documents.reExtractTitle"),
      t("admin.documents.reExtractBody"),
      [
        { text: t("admin.documents.cancel"), style: "cancel" },
        {
          text: t("admin.documents.reExtract"),
          style: "destructive",
          onPress: () => extractMutation.mutate(),
        },
      ],
    );
  }

  function confirmDelete() {
    Alert.alert(t("admin.documents.deleteTitle"), t("admin.documents.deleteBody"), [
      { text: t("admin.documents.cancel"), style: "cancel" },
      {
        text: t("admin.documents.delete"),
        style: "destructive",
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader
        kicker={t("admin.documents.kicker")}
        title={t("admin.documents.detailTitle")}
        right={
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-full border border-border bg-surface active:opacity-80"
          >
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>
        }
      />

      {detailQuery.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.gold} />
          <Text className="mt-3 font-body text-[13px] text-text-secondary">
            {t("common.loading")}
          </Text>
        </View>
      ) : detailQuery.isError || !detail ? (
        <View className="mx-5 mt-4 items-center rounded-2xl border border-border bg-surface px-6 py-10">
          <Text className="font-body text-[13px] text-text-secondary">
            {t("admin.documents.loadFailed")}
          </Text>
          <View className="mt-3">
            <Button
              label={t("common.retry")}
              variant="secondary"
              onPress={() => void detailQuery.refetch()}
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={detail.rows}
          keyExtractor={(row) => row.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshing={detailQuery.isRefetching}
          onRefresh={() => {
            void detailQuery.refetch();
          }}
          ListHeaderComponent={
            <DocumentHeader
              document={detail.document}
              rows={detail.rows}
              publishing={publishMutation.isPending}
              extracting={extractMutation.isPending}
              deleting={deleteMutation.isPending}
              onPublish={confirmPublish}
              onReExtract={confirmReExtract}
              onDelete={confirmDelete}
            />
          }
          ListEmptyComponent={
            <View className="mx-5 mt-4 items-center rounded-2xl border border-border bg-surface px-6 py-10">
              <Ionicons
                name="albums-outline"
                size={36}
                color={colors.textMuted}
              />
              <Text className="mt-3 text-center font-body text-[12px] leading-5 text-text-muted">
                {t("admin.documents.noRows")}
              </Text>
            </View>
          }
          renderItem={({ item }) => <RowCard row={item} />}
        />
      )}
    </Screen>
  );
}

function DocumentHeader({
  document,
  rows,
  publishing,
  extracting,
  deleting,
  onPublish,
  onReExtract,
  onDelete,
}: {
  document: AdminDocument;
  rows: AdminDocumentRow[];
  publishing: boolean;
  extracting: boolean;
  deleting: boolean;
  onPublish: () => void;
  onReExtract: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar" : "en";

  const matched = rows.filter((row) => row.instrumentId).length;
  const unmatched = rows.length - matched;
  const withIssues = rows.filter((row) => row.reviewNote).length;
  const canPublish = document.status === "validated" && matched > 0;

  return (
    <View>
      <View className="mx-5 mt-1 rounded-2xl border border-border bg-surface p-4">
        <Text className="font-title text-[13px] leading-5 text-text" numberOfLines={2}>
          {document.filename}
        </Text>

        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          <View
            className="flex-row items-center gap-1.5 rounded-full bg-surface-elevated px-2.5 py-1"
          >
            <View
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: STATUS_TONE[document.status] ?? colors.textSecondary,
              }}
            />
            <Text className="font-body text-[11px] text-text-secondary">
              {t(`admin.status.${document.status}`, { defaultValue: document.status })}
            </Text>
          </View>

          <Text className="font-body text-[11px] text-text-muted" style={tabular}>
            {document.pages} {t("admin.documents.pages")}
          </Text>
        </View>

        <View className="mt-3 gap-1.5">
          <MetaRow
            label={t("admin.documents.period")}
            value={`${formatDateWithYear(document.periodStart, locale)} → ${formatDateWithYear(document.periodEnd, locale)}`}
          />
          <MetaRow
            label={t("admin.documents.uploadedBy")}
            value={document.uploadedBy}
          />
          <MetaRow
            label={t("admin.documents.uploadedAt")}
            value={formatDateWithYear(document.uploadedAt, locale)}
          />
        </View>
      </View>

      <View className="mx-5 mt-3 flex-row overflow-hidden rounded-2xl border border-border bg-surface">
        <CountCell label={t("admin.documents.matched")} value={matched} tone={colors.up} />
        <View className="w-px bg-border" />
        <CountCell
          label={t("admin.documents.unmatched")}
          value={unmatched}
          tone={unmatched > 0 ? colors.down : colors.textMuted}
        />
        <View className="w-px bg-border" />
        <CountCell
          label={t("admin.documents.withIssues")}
          value={withIssues}
          tone={withIssues > 0 ? colors.warning : colors.textMuted}
        />
      </View>

      <View className="mx-5 mt-4 gap-2.5">
        {canPublish ? (
          <Button
            label={
              publishing ? t("admin.documents.publishing") : t("admin.documents.publish")
            }
            loading={publishing}
            onPress={onPublish}
          />
        ) : null}

        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button
              label={
                extracting ? t("admin.documents.extracting") : t("admin.documents.reExtract")
              }
              variant="secondary"
              loading={extracting}
              onPress={onReExtract}
            />
          </View>
          <View className="flex-1">
            <Button
              label={deleting ? t("admin.documents.deleting") : t("admin.documents.delete")}
              variant="secondary"
              loading={deleting}
              onPress={onDelete}
            />
          </View>
        </View>
      </View>

      <View className="mx-5 mt-6 flex-row items-baseline justify-between">
        <Text className="font-label text-[10px] uppercase tracking-[0.14em] text-text-muted">
          {t("admin.documents.rows")}
        </Text>
        <Text className="font-body text-[11px] text-text-muted" style={tabular}>
          {rows.length}
        </Text>
      </View>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="font-body text-[11px] text-text-muted">{label}</Text>
      <Text className="flex-1 pl-3 text-left font-body text-[11px] text-text-secondary" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function CountCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <View className="flex-1 items-center py-3">
      <Text className="font-display text-[18px]" style={[{ color: tone }, tabular]}>
        {value}
      </Text>
      <Text className="mt-0.5 font-body text-[10px] text-text-muted">{label}</Text>
    </View>
  );
}

function RowCard({ row }: { row: AdminDocumentRow }) {
  const { t } = useTranslation();

  const matched = Boolean(row.instrumentId);
  const method = methodFromNote(row.reviewNote);
  const methodLabel = method
    ? t(`admin.method.${method}`, { defaultValue: method })
    : t("admin.method.matched");

  return (
    <View
      className={`mx-5 mb-2 rounded-2xl border bg-surface px-4 py-3 ${
        row.reviewNote ? "border-warning/40" : "border-border"
      }`}
    >
      <View className="flex-row items-center">
        <View className="flex-1 pr-3">
          <View className="flex-row items-center gap-2">
            <Text className="font-title text-[13px] text-text" style={tabular}>
              {row.ticker ?? "—"}
            </Text>
            <Text className="flex-1 font-body text-[11px] text-text-secondary" numberOfLines={1}>
              {row.nameAr ?? row.nameEn ?? "—"}
            </Text>
          </View>

          <View className="mt-1.5 flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <Text className="font-body text-[11px] text-text-muted" style={tabular}>
              {t("admin.documents.close")}: {formatPrice(row.close)}
            </Text>
            <Text className="font-body text-[11px] text-text-muted" style={tabular}>
              {t("admin.documents.page")}: {row.page}
            </Text>
            <Text
              className="font-body text-[11px]"
              style={{ color: matched ? colors.up : colors.down }}
            >
              {methodLabel}
            </Text>
          </View>
        </View>

        <View
          className="h-6 w-6 items-center justify-center rounded-full"
          style={{
            backgroundColor: matched ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          }}
        >
          <Ionicons
            name={matched ? "checkmark" : "close"}
            size={13}
            color={matched ? colors.up : colors.down}
          />
        </View>
      </View>

      {row.reviewNote ? (
        <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
          {failedChecks(row.reviewNote).map((check) => (
            <View
              key={check}
              className="rounded-full bg-warning-surface px-2 py-0.5"
            >
              <Text className="font-body text-[10px] leading-4 text-warning">
                {t(`admin.check.${check}`, { defaultValue: check })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
