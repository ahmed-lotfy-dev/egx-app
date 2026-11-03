import type { Document, DetailData } from "../types";
import { useState, useEffect, useRef } from "react";




export interface Props {
  document: Document;
  onBack: () => void;
  onRefresh: () => void;
}

const methodLabels: Record<string, string> = {
  exact_ticker: "مطابق بالكود",
  exact_ar: "مطابق بالاسم العربي",
  exact_en: "مطابق بالاسم الإنجليزي",
  fuzzy_ar: "تقريبي (عربي)",
  fuzzy_ar_contain: "محتوى (عربي)",
  fuzzy_en_contain: "محتوى (إنجليزي)",
  unmatched: "غير مطابق",
};

export function DocumentDetail({ document, onBack, onRefresh }: Props) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/admin/documents/${document.id}`, {
          credentials: "include",
        });
        const data = await res.json();
        setDetail(data.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();

    // SSE for logs
    const es = new EventSource(`/api/admin/documents/${document.id}/events`, {
      withCredentials: true,
    });
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.ts && event.message) {
          setLogs((prev) => [...prev.slice(-200), `${event.ts} ${event.level}: ${event.message}`]);
        }
      } catch {}
    };
    eventSourceRef.current = es;

    return () => {
      eventSourceRef.current?.close();
    };
  }, [document.id]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/documents/${document.id}/publish`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("فشل النشر");
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "فشل النشر");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">جاري التحميل...</div>;
  if (!detail) return <div className="p-8 text-center text-red-500">فشل التحميل</div>;

  const { rows } = detail;
  const matched = rows.filter((r) => r.instrumentId).length;
  const unmatched = rows.filter((r) => !r.instrumentId).length;
  const withIssues = rows.filter((r) => r.reviewNote).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-primary-600 hover:text-primary-700 text-sm font-medium">
          ← العودة للقائمة
        </button>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded">
            SHA: {document.sha256.slice(0, 12)}…
          </span>
          {document.status === "validated" && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {publishing ? "جاري النشر..." : "نشر واعتماد"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-sm text-gray-500">الملف</p>
          <p className="font-medium text-gray-900">{document.filename}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-sm text-gray-500">الفترة</p>
          <p className="font-medium text-gray-900">{document.periodStart} → {document.periodEnd}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-sm text-gray-500">الصفوف</p>
          <p className="font-medium text-gray-900">{rows.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-sm text-gray-500">مطابق / غير مطابق</p>
          <p className="font-medium text-gray-900">{matched} / {unmatched}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">#</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">الكود</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">الاسم العربي</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">الإغلاق</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">رأس المال</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">القيمة السوقية</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">P/E</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">العائد</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">صافي الربح</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">المطابقة</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, idx) => (
                <tr key={row.id} className={row.reviewNote ? "bg-yellow-50" : "hover:bg-gray-50"}>
                  <td className="px-3 py-2 text-xs text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 text-xs font-medium text-gray-900">{row.ticker || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-700 truncate max-w-xs">{row.nameAr || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{row.close?.toLocaleString() || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{row.paidCapital?.toLocaleString() || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{row.marketCap?.toLocaleString() || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{row.peTrailing?.toFixed(2) || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{row.dividendYield?.toFixed(2) || "—"}%</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{row.netProfit?.toLocaleString() || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.instrumentId ? (
                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700">
                        {methodLabels[row.reviewNote?.match(/method":"([^"]+)"/)?.[1] || "matched"] || "مطابق"}
                      </span>
                    ) : (
                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">
                        غير مطابق
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-xs">
                    {row.reviewNote ? row.reviewNote.slice(0, 60) + "…" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span>إجمالي: {rows.length}</span>
            <span className="text-green-600">مطابق: {matched}</span>
            <span className="text-red-600">غير مطابق: {unmatched}</span>
            <span className="text-yellow-600">بملاحظات: {withIssues}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-medium text-gray-900">سجل العمليات (Live)</h3>
          <span className="text-xs text-gray-500">{logs.length} رسائل</span>
        </div>
        <div
          ref={logContainerRef}
          className="p-4 h-64 overflow-y-auto scrollbar-thin font-mono text-xs text-gray-700 bg-gray-50"
        >
          {logs.map((log, i) => (
            <div key={i} className="py-0.5 border-b border-gray-200 last:border-0">
              {log}
            </div>
          ))}
          {logs.length === 0 && <p className="text-gray-400 text-center py-8">لا توجد رسائل بعد</p>}
        </div>
      </div>
    </div>
  );
}
