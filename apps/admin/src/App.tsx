import { useState, useEffect } from "react";
import type { Document } from "./types";
import { DocumentsList } from "./components/DocumentsList";
import { DocumentDetail } from "./components/DocumentDetail";
import { LoginScreen } from "./components/LoginScreen";
import "./index.css";

type View = "login" | "list" | "detail";

const api = (path: string, options?: RequestInit) =>
  fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  }).then(async (r) => {
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: { message: r.statusText } }));
      throw new Error(err.error?.message || r.statusText);
    }
    return r.json();
  });

export function App() {
  const [view, setView] = useState<View>("login");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  void showUpload;

  const checkAuth = async () => {
    try {
      await api("/admin/documents");
      setView("list");
      loadDocuments();
    } catch {
      setView("login");
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const data = await api("/admin/documents");
      setDocuments(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (email: string, otp: string) => {
    setLoading(true);
    setError(null);
    try {
      await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      await checkAuth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File, periodStart: string, periodEnd: string) => {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("periodStart", periodStart);
      form.append("periodEnd", periodEnd);
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "فشل الرفع");
      }
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الرفع");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (doc: Document) => {
    setSelectedDoc(doc);
    setView("detail");
  };

  const handleBack = () => {
    setSelectedDoc(null);
    setView("list");
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (view === "login") {
    return <LoginScreen onLogin={handleLogin} loading={loading} error={error} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">لوحة تحكم EGX</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">التقارير الربعية</span>
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              رفع تقرير جديد
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
          </div>
        )}

        {view === "list" && (
          <DocumentsList
            documents={documents}
            loading={loading}
            onUpload={handleUpload}
            onSelect={handleSelect}
          />
        )}

        {view === "detail" && selectedDoc && (
          <DocumentDetail
            document={selectedDoc}
            onBack={handleBack}
            onRefresh={loadDocuments}
          />
        )}
      </main>
    </div>
  );
}
