import type { Document } from "../types";
import { useState, FormEvent } from "react";

interface Props {
  documents: Document[];
  onUpload: (file: File, periodStart: string, periodEnd: string) => void;
  onSelect: (doc: Document) => void;
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

export function DocumentsList({ documents, onUpload, onSelect }: Props) {
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!file || !periodStart || !periodEnd) return;
    onUpload(file, periodStart, periodEnd);
    setShowUpload(false);
    setFile(null);
    setPeriodStart("");
    setPeriodEnd("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">التقارير المرفوعة</h2>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
        >
          رفع تقرير جديد
        </button>
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
                  onChange={(e) => e.target.files && setFile(e.target.files[0])}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">بداية الفترة</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!file || !periodStart || !periodEnd}
                  className="flex-1 py-2 px-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  رفع
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
              {documents.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    لا توجد تقارير مرفوعة بعد
                  </td>
                </tr>
              )}
              {documents.map((doc) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}