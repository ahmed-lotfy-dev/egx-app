import type { Document } from "../types";
import { useState, useEffect, FormEvent } from "react";

import { OCI_API_BASE } from "../config";

interface Props {
  documents: Document[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelect: (doc: Document) => void;
}

/**
 * Extract period dates from EGX filename.
 * Expected format: DiscDoc_ID{ID}_{DD-MMM-YYYY}_ARB.pdf
 * Example: DiscDoc_ID55542_30-Sep-2026_ARB.pdf
 * Period: 2026-07-01 to 2026-09-30 (quarter ending on the date in filename)
 */
function extractDatesFromFilename(filename: string): { periodStart: string; periodEnd: string } | null {
  // Match pattern: DiscDoc_ID<number>_<DD-MMM-YYYY>_ARB.pdf
  const match = filename.match(/DiscDoc_ID\d+_(\d{1,2})-([A-Za-z]{3})-(\d{4})_ARB\.pdf$/i);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthStr = match[2];
  const year = parseInt(match[3], 10);

  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };

  const month = monthMap[monthStr.toLowerCase()];
  if (!month) return null;

  // The date in filename is the quarter END date
  const periodEnd = new Date(year, month - 1, day);
  const periodStart = new Date(year, month - 3, 1); // Quarter start = 3 months before, 1st day

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  return {
    periodStart: formatDate(periodStart),
    periodEnd: formatDate(periodEnd),
  };
}

const statusColors: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-700",
  extracting: "bg-blue-100 text-blue-700",
  extracted: "bg-indigo-100 text-indigo-700",
  validating: "bg-yellow-100 text-yellow-700",
  validated: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  published: "bg-emerald-100 text-emerald-700",
};

const statusLabels: Record<string, string> = {
  uploaded: "مُرفَع",
  extracting: "قيد الاستخراج",
  extracted: "مُستخرَج",
  validating: "قيد التحقق",
  validated: "مُحقَّق",
  failed: "فشل",
  published: "منشور",
};

export function DocumentsList({ documents, isLoading, onRefresh, onSelect }: Props) {
  const [showUpload, setShowUpload] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !periodStart || !periodEnd) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      // Real upload with progress tracking
      const form = new FormData();
      form.append("file", file);
      form.append("periodStart", periodStart);
      form.append("periodEnd", periodEnd);

      // Use XMLHttpRequest for real upload progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${OCI_API_BASE}/api/admin/documents`, true);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error?.message || "فشل الرفع"));
            } catch {
              reject(new Error("فشل الرفع"));
            }
          }
        };

        xhr.onerror = () => reject(new Error("خطأ في الاتصال"));
        xhr.ontimeout = () => reject(new Error("انتهت مهلة الرفع"));
        xhr.timeout = 10 * 60 * 1000; // 10 minutes

        xhr.send(form);
      });

      setUploadProgress(100);
      setShowUpload(false);
      setFile(null);
      setPeriodStart("");
      setPeriodEnd("");
      await onRefresh();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "فشل الرفع");
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 500);
    }
  };

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">التقارير المرفوعة</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowScan(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              مسح المجلد المحلي
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
            >
              رفع تقرير جديد
            </button>
          </div>
        </div>

      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowUpload(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">رفع تقرير ربع سنوي</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملف PDF</label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const selectedFile = e.target.files[0];
                      setFile(selectedFile);
                      
                      // Auto-extract dates from filename
                      const dates = extractDatesFromFilename(selectedFile.name);
                      if (dates) {
                        setPeriodStart(dates.periodStart);
                        setPeriodEnd(dates.periodEnd);
                      }
                    }
                  }}
                  required
                  disabled={uploading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                {uploading && file && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{file.name}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-600 transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              {uploadError && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{uploadError}</p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">بداية الفترة</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                    disabled={uploading}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">نهاية الفترة</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                    disabled={uploading}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  disabled={uploading}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={uploading || !file || !periodStart || !periodEnd}
                  className="flex-1 py-2 px-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {uploading ? "جاري الرفع..." : "رفع"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">#</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">الملف</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">الفترة</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">الصفحات</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">مُرفَع بواسطة</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">التاريخ</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      <span>جاري تحميل التقارير...</span>
                    </div>
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    لا توجد تقارير مرفوعة بعد
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onSelect(doc)}>
                    <td className="px-4 py-3 text-sm text-gray-900">{doc.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 truncate max-w-xs">{doc.filename}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {doc.periodStart} → {doc.periodEnd}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{doc.pages || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[doc.status] || "bg-gray-100 text-gray-700"}`}>
                        {statusLabels[doc.status] || doc.status}
                      </span>
                      {doc.error && (
                        <span className="ml-2 text-xs text-red-600">⚠ {doc.error}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{doc.uploadedBy}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {new Date(doc.uploadedAt).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelect(doc); }}
                        className="px-3 py-1 text-sm bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                      >
                        عرض
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  
    <DocumentsScanModal isOpen={showScan} onClose={() => setShowScan(false)} onRefresh={onRefresh} />
  </>
);
}

// DocumentsScanModal component
interface ScanResult {
  filename: string;
  sha256: string;
  size: number;
  modifiedAt: string;
  alreadyUploaded: boolean;
  existingStatus: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export function DocumentsScanModal({ isOpen, onClose, onRefresh }: { isOpen: boolean; onClose: () => void; onRefresh: () => void }) {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      runScan();
    }
  }, [isOpen]);

  const runScan = async () => {
    setScanning(true);
    setErrors({});
    try {
      const res = await fetch(`${OCI_API_BASE}/api/admin/documents/scan`, { credentials: "include" });
      const data = await res.json();
      if (data.data) setResults(data.data);
    } catch (e) {
      setErrors({ global: e instanceof Error ? e.message : "فشل المسح" });
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async (item: ScanResult) => {
    setImporting((prev) => new Set(prev).add(item.sha256));
    setErrors((prev) => ({ ...prev, [item.sha256]: "" }));
    try {
      const res = await fetch(`${OCI_API_BASE}/api/admin/documents/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: item.filename,
          periodStart: item.periodStart,
          periodEnd: item.periodEnd,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "فشل الاستيراد" } }));
        throw new Error(err.error?.message || "فشل الاستيراد");
      }
      setResults((prev) => prev.map((r) => (r.sha256 === item.sha256 ? { ...r, alreadyUploaded: true } : r)));
      onRefresh();
    } catch (e) {
      setErrors((prev) => ({ ...prev, [item.sha256]: e instanceof Error ? e.message : "فشل الاستيراد" }));
    } finally {
      setImporting((prev) => { const n = new Set(prev); n.delete(item.sha256); return n; });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] p-6 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">مسح المجلد المحلي (incoming)</h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            المجلد: <code className="bg-gray-100 px-2 py-1 rounded text-xs">.data/egx/incoming/</code>
          </p>
          <button
            onClick={runScan}
            disabled={scanning}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {scanning ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                جاري المسح...
              </span>
            ) : (
              "إعادة المسح"
            )}
          </button>
        </div>

        {errors.global && <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-4">{errors.global}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">الملف</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">الحجم</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">التاريخ المعدل</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">الفترة المستخرجة</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">الحالة</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    {scanning ? "جاري البحث عن ملفات PDF..." : "لا توجد ملفات PDF في المجلد"}
                  </td>
                </tr>
              ) : (
                results.map((item) => (
                  <tr key={item.sha256} className={item.alreadyUploaded ? "bg-green-50" : "hover:bg-gray-50"}>
                    <td className="px-3 py-2 text-sm text-gray-700 truncate max-w-xs">{item.filename}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{(item.size / 1024 / 1024).toFixed(1)} MB</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{new Date(item.modifiedAt).toLocaleDateString("ar-EG")}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {item.periodStart && item.periodEnd ? `${item.periodStart} → ${item.periodEnd}` : <span className="text-red-500">تعذر الاستخراج</span>}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {item.alreadyUploaded ? (
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                          مرفوع ({item.existingStatus})
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                          جديد
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {item.alreadyUploaded ? (
                        <span className="text-green-600">مُرفَع مسبقاً</span>
                      ) : (
                        <button
                          onClick={() => handleImport(item)}
                          disabled={importing.has(item.sha256) || !item.periodStart || !item.periodEnd}
                          className={`px-3 py-1 text-xs rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed ${
                            importing.has(item.sha256) ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {importing.has(item.sha256) ? "جاري الاستيراد..." : "استيراد"}
                        </button>
                      )}
                      {errors[item.sha256] && <p className="text-xs text-red-600 mt-1">{errors[item.sha256]}</p>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}