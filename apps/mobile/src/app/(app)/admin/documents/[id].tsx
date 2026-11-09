import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ConfirmAlert, useConfirm } from "@/components/ConfirmAlert";
import { colors, tabular } from "@/constants/theme";
import {
  adminApi,
  type AdminDocument,
  type AdminDocumentRow,
} from "@/lib/admin-api";
import { formatDateWithYear, formatPrice, formatRelativeTime } from "@/lib/format";
import { apiBaseUrl } from "@/lib/config";
import { authClient } from "@/lib/auth-client";

const STATUS_TONE: Record<string, string> = {
  uploaded: colors.textSecondary,
  extracting: colors.gold,
  extracted: colors.text,
  validating: colors.warning,
  validated: colors.up,
  failed: colors.down,
  published: colors.up,
};

function formatQuarter(periodStart: string | null | undefined, periodEnd: string | null | undefined): string {
  if (!periodStart || !periodEnd) return "—";
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "—";
  
  const month = start.getMonth(); // 0-indexed
  const year = start.getFullYear();
  const quarter = Math.floor(month / 3) + 1;
  return `Q${quarter} ${year}`;
}

const EXTRACTION_STATUSES = ["extracting", "extracted", "validating"];

function methodFromNote(note: string | null): string | null {
  if (!note) return null;
  const match = note.match(/method":"([^"]+)"/);
  return match?.[1] ?? null;
}

function failedChecks(note: string | null): string[] {
  if (!note) return [];

  return note
    .split(";")
    .map((part) => part.slice(0, part.indexOf(":")).trim())
    .filter((name) => name.length > 0);
}

export default function AdminDocumentDetailScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar" : "en";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  // SSE state
  const [sseLogs, setSseLogs] = useState<Array<{ type: string; data: unknown; timestamp: number }>>([]);
  const [sseStatus, setSseStatus] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const detailQuery = useQuery({
    queryKey: ["admin", "documents", id],
    queryFn: async () => {
      console.log("[AdminDetail] Fetching detail for:", id);
      const result = await adminApi.detail(id);
      console.log("[AdminDetail] Result:", result);
      return result;
    },
    enabled: Boolean(id),
    staleTime: 10_000,
    refetchInterval: (query) => {
      try {
        const status = query.state.data?.data?.document?.status;
        return EXTRACTION_STATUSES.includes(status ?? "") ? 3000 : false;
      } catch {
        return false;
      }
    },
  });

  const detail = detailQuery.data?.data;
  const documentStatus = detail?.document?.status;
  
  console.log("[AdminDetail] Render state:", { isPending: detailQuery.isPending, isError: detailQuery.isError, hasDetail: !!detail, documentStatus, error: detailQuery.error?.message });

  // Connect SSE via fetch + ReadableStream (native RN way)
  useEffect(() => {
    if (!id || !documentStatus) return;
    if (!EXTRACTION_STATUSES.includes(documentStatus)) return;

    let closed = false;

    const connect = async () => {
      const cookie = await authClient.getCookie();
      if (closed) return;

      const url = `${apiBaseUrl}/api/admin/documents/${encodeURIComponent(id)}/events`;
      const headers: HeadersInit = cookie ? { Cookie: cookie } : {};

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);

        setSseConnected(true);
        setSseLogs([]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent: string | null = null;

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);
                // Use server timestamp if available, otherwise current time
                const serverTimestamp = (parsed as any)?.ts || (parsed as any)?.timestamp || Date.now();
                if (currentEvent === "status" || (parsed && typeof parsed === "object" && "status" in parsed)) {
                  setSseStatus((parsed as { status: string }).status);
                } else {
                  setSseLogs((prev) => [...prev, { type: "log", data: parsed, timestamp: serverTimestamp }]);
                }
              } catch {
                setSseLogs((prev) => [...prev, { type: "log", data, timestamp: Date.now() }]);
              }
              currentEvent = null;
            }
          }
        }
      } catch (err) {
        if (!closed && err instanceof Error && err.name !== "AbortError") {
          console.warn("[SSE] Connection error:", err.message);
        }
        setSseConnected(false);
      }
    };

    connect();

    return () => {
      closed = true;
      abortControllerRef.current?.abort();
      setSseConnected(false);
    };
  }, [id, documentStatus]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
  };

  const publishMutation = useMutation({
    mutationFn: () => adminApi.publish(id),
    onSuccess: async (res) => {
      await invalidate();
      await detailQuery.refetch();
      await alert({
        title: t("admin.documents.done"),
        message: t("admin.documents.publishResult", {
          published: res.data.published,
          skipped: res.data.skippedUnmatched,
        }),
      });
    },
    onError: (error: Error) => {
      const errMsg = { title: t("admin.documents.failed"), message: error.message };
      alert(errMsg);
    }
  });

  const extractMutation = useMutation({
    mutationFn: () => adminApi.extract(id),
    onSuccess: async () => {
      await invalidate();
      await detailQuery.refetch();
      await (async () => { const msg = { title: t("admin.documents.done"), message: t("admin.documents.reExtractStarted") }; await alert(msg); })();
    },
    onError: (error: Error) => {
      const errMsg = { title: t("admin.documents.failed"), message: error.message };
      alert(errMsg);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.remove(id),
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
    onError: (error: Error) => {
      const errMsg = { title: t("admin.documents.failed"), message: error.message };
      alert(errMsg);
    }
  });

  // Parse pages mutation
  const parseMutation = useMutation({
    mutationFn: () => adminApi.parsePages(id),
    onSuccess: async () => {
      await invalidate();
      await detailQuery.refetch();
      await alert({ title: t("admin.documents.done"), message: t("admin.documents.parsePagesStarted") });
    },
    onError: (error: Error) => {
      const errMsg = { title: t("admin.documents.failed"), message: error.message };
      alert(errMsg);
    }
  });

  // Stage document mutation
  const stageMutation = useMutation({
    mutationFn: () => adminApi.stage(id),
    onSuccess: async () => {
      await invalidate();
      await detailQuery.refetch();
      await alert({ title: t("admin.documents.done"), message: t("admin.documents.stageStarted") });
    },
    onError: (error: Error) => {
      const errMsg = { title: t("admin.documents.failed"), message: error.message };
      alert(errMsg);
    }
  });

  // Embed document mutation
  const embedMutation = useMutation({
    mutationFn: () => adminApi.embed(id),
    onSuccess: async () => {
      await invalidate();
      await detailQuery.refetch();
      await alert({ title: t("admin.documents.done"), message: t("admin.documents.embedStarted") });
    },
    onError: (error: Error) => {
      const errMsg = { title: t("admin.documents.failed"), message: error.message };
      alert(errMsg);
    }
  });

  const { confirm, alert, visible, title, message, buttons, onClose } = useConfirm();

  function confirmPublish() {
    confirm({
      title: t("admin.documents.publishTitle"),
      message: t("admin.documents.publishBody"),
      confirmText: t("admin.documents.publish"),
      cancelText: t("admin.documents.cancel"),
    }).then((confirmed: boolean) => {
      if (confirmed) publishMutation.mutate();
    });
  }

  function confirmReExtract() {
    confirm({
      title: t("admin.documents.reExtractTitle"),
      message: t("admin.documents.reExtractBody"),
      confirmText: t("admin.documents.reExtract"),
      cancelText: t("admin.documents.cancel"),
      destructive: true,
    }).then((confirmed: boolean) => {
      if (confirmed) extractMutation.mutate();
    });
  }

  function confirmParse() {
    confirm({
      title: t("admin.documents.parseTitle"),
      message: t("admin.documents.parseBody"),
      confirmText: t("admin.documents.parsePages"),
      cancelText: t("admin.documents.cancel"),
    }).then((confirmed: boolean) => {
      if (confirmed) parseMutation.mutate();
    });
  }

  function confirmStage() {
    confirm({
      title: t("admin.documents.stageTitle"),
      message: t("admin.documents.stageBody"),
      confirmText: t("admin.documents.stage"),
      cancelText: t("admin.documents.cancel"),
    }).then((confirmed: boolean) => {
      if (confirmed) stageMutation.mutate();
    });
  }

  function confirmEmbed() {
    confirm({
      title: t("admin.documents.embedTitle"),
      message: t("admin.documents.embedBody"),
      confirmText: t("admin.documents.embed"),
      cancelText: t("admin.documents.cancel"),
    }).then((confirmed: boolean) => {
      if (confirmed) embedMutation.mutate();
    });
  }

  function confirmDelete() {
    confirm({
      title: t("admin.documents.deleteTitle"),
      message: t("admin.documents.deleteBody"),
      confirmText: t("admin.documents.delete"),
      cancelText: t("admin.documents.cancel"),
      destructive: true,
    }).then((confirmed: boolean) => {
      if (confirmed) deleteMutation.mutate();
    });
  }

  const isExtracting = EXTRACTION_STATUSES.includes(documentStatus ?? "");

  return (
    <>
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
            {detailQuery.isError
              ? t("admin.documents.loadFailed") + `: ${detailQuery.error?.message || "Unknown error"}`
              : t("admin.documents.loadFailed") + " (no data)"}
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
              parsing={parseMutation.isPending}
              staging={stageMutation.isPending}
              embedding={embedMutation.isPending}
              onPublish={confirmPublish}
              onReExtract={confirmReExtract}
              onDelete={confirmDelete}
              onParse={confirmParse}
              onStage={confirmStage}
              onEmbed={confirmEmbed}
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

      {/* SSE Progress Panel */}
      {isExtracting && (
        <ExtractionProgressPanel
          status={sseStatus ?? documentStatus ?? "uploaded"}
          logs={sseLogs}
          connected={sseConnected}
          onClose={() => {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
          }}
          t={t}
          locale={locale}
        />
      )}
    </Screen>
    <ConfirmAlert
      visible={visible}
      title={title}
      message={message}
      buttons={buttons}
      onClose={onClose}
    />
    </>
  );
}

function ExtractionProgressPanel({
  status,
  logs,
  connected,
  onClose,
  t,
  locale,
}: {
  status: string;
  logs: Array<{ type: string; data: unknown; timestamp: number }>;
  connected: boolean;
  onClose: () => void;
  t: (key: string, options?: { defaultValue?: string }) => string;
  locale: "ar" | "en";
}) {
  const statusLabels: Record<string, string> = {
    extracting: "جاري الاستخراج…",
    extracted: "تم الاستخراج",
    validating: "جاري التحقق…",
    validated: "تم التحقق",
    failed: "فشل",
  };

  return (
    <View className="mx-5 mb-4 rounded-2xl border border-gold/40 bg-gold/5 p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View
            className={`h-2 w-2 rounded-full ${connected ? "bg-up" : "bg-down"}`}
          />
          <Text className="font-title text-[13px] text-gold">
            {statusLabels[status] ?? t(`admin.status.${status}`, { defaultValue: status })}
          </Text>
        </View>
        <Pressable onPress={onClose} className="p-1">
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {logs.length > 0 && (
        <ScrollView className="mt-3 max-h-64" contentContainerStyle={{ paddingBottom: 8 }}>
          {logs.slice(-50).map((entry, index) => {
            // Parse the SSE event data (already parsed JSON from server)
            const data = entry.data as Record<string, unknown>;
            const message = (data?.message as string) || "";
            const level = (data?.level as string) || "info";
            const type = (data?.type as string) || "";
            const progress = (data?.progress as number) ?? null;
            const status = (data?.status as string) || "";
            
            // Human-readable label based on log type
            let displayText = message;
            if (type === "extraction_progress" && progress !== null) {
              displayText = `استخراج: ${progress}% ${status}`;
            } else if (type === "extraction_complete") {
              displayText = "✅ اكتمل الاستخراج";
            } else if (type === "extraction_failed") {
              displayText = "❌ فشل الاستخراج";
            } else if (type === "step") {
              displayText = message; // already human-readable
            }
            
            const isError = level === "error";
            const isProgress = level === "info" && (type?.includes("progress") || type?.includes("step"));
            const isSuccess = type === "extraction_complete";
            
            // Better date/time format
            const logDate = new Date(entry.timestamp);
            const now = new Date();
            const isToday = logDate.toDateString() === now.toDateString();
            const timeStr = logDate.toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const dateStr = isToday ? "" : `${logDate.toLocaleDateString(locale, { day: "2-digit", month: "short" })} `;
            
            return (
              <View
                key={index}
                className="flex-row items-start gap-2 text-[10px] font-body mb-1"
              >
                <Text className="whitespace-nowrap" style={{ color: colors.gold }}>
                  {dateStr}{timeStr}
                </Text>
                <Text className="flex-1 break-all" style={{ 
                  color: isError ? colors.down : isProgress ? colors.gold : isSuccess ? colors.up : colors.text 
                }}>
                  {displayText}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {logs.length === 0 && (
        <Text className="mt-2 text-center text-[12px] text-text-muted">
          {connected ? "جاري انتظار السجلات…" : "جاري الاتصال…"}
        </Text>
      )}
    </View>
  );
}

function DocumentHeader({
  document,
  rows,
  publishing,
  extracting,
  deleting,
  parsing,
  staging,
  embedding,
  onPublish,
  onReExtract,
  onDelete,
  onParse,
  onStage,
  onEmbed,
}: {
  document: AdminDocument;
  rows: AdminDocumentRow[];
  publishing: boolean;
  extracting: boolean;
  deleting: boolean;
  parsing: boolean;
  staging: boolean;
  embedding: boolean;
  onPublish: () => void;
  onReExtract: () => void;
  onDelete: () => void;
  onParse: () => void;
  onStage: () => void;
  onEmbed: () => void;
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
          {formatQuarter(document.periodStart, document.periodEnd)}
        </Text>

        <View className="mt-1 flex-row items-center gap-1.5">
          <Text className="font-body text-[11px] text-text-muted">
            {document.filename}
          </Text>
        </View>

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
            value={`${formatDateWithYear(document.periodStart ?? "", locale)} → ${formatDateWithYear(document.periodEnd ?? "", locale)}`}
          />
          <MetaRow
            label={t("admin.documents.uploadedBy")}
            value={document.uploadedBy}
          />
          <MetaRow
            label={t("admin.documents.uploadedAt")}
            value={formatDateWithYear(document.uploadedAt ?? "", locale)}
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

        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button
              label={
                parsing ? t("admin.documents.parsing") : t("admin.documents.parsePages")
              }
              variant="secondary"
              loading={parsing}
              onPress={onParse}
            />
          </View>
          <View className="flex-1">
            <Button
              label={staging ? t("admin.documents.staging") : t("admin.documents.stage")}
              variant="secondary"
              loading={staging}
              onPress={onStage}
            />
          </View>
        </View>

        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button
              label={embedding ? t("admin.documents.embedding") : t("admin.documents.embed")}
              variant="secondary"
              loading={embedding}
              onPress={onEmbed}
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