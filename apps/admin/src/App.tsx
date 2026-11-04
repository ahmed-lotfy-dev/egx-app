import { useState, useEffect } from "react";
import { DocumentsList } from "./components/DocumentsList";
import { DocumentDetail } from "./components/DocumentDetail";
import { LoginScreen } from "./components/LoginScreen";
import { OTPScreen } from "./components/OTPScreen";
import "./index.css";
import "./types/auth";

export interface Document {
  id: number;
  sha256: string;
  filename: string;
  periodStart: string;
  periodEnd: string;
  pages: number;
  status: string;
  error: string | null;
  uploadedBy: string;
  uploadedAt: string;
  publishedAt: string | null;
}

type View = "login" | "otp" | "list" | "detail";

const OCI_API_BASE = "https://egx-api.alotfy.site";

const api = (path: string, options?: RequestInit) =>
  fetch(`${OCI_API_BASE}/api${path}`, {
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
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ user: { isAdmin: boolean; email: string } | null } | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  void showUpload;

  const checkAuth = async () => {
    try {
      // better-auth's get-session returns { session, user } directly (or null).
      const data = await fetch(`${OCI_API_BASE}/api/auth/get-session`, {
        credentials: "include",
      }).then((r) => r.json());
      const user = data?.user as { isAdmin?: boolean; email?: string } | undefined;
      if (user?.isAdmin) {
        setSession(data as { user: { isAdmin: boolean; email: string } | null });
        setView("list");
        loadDocuments();
      } else {
        setSession(null);
        setView("login");
      }
    } catch {
      setView("login");
    }
  };

  const loadDocuments = async () => {
    try {
      const data = await api("/admin/documents");
      setDocuments(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  };

  const handleSendCode = (email: string) => {
    setOtpEmail(email);
    setView("otp");
  };

  const handleVerify = async (_email: string, _otp: string) => {
    setError(null);
    // OTPScreen already exchanged the code for a session cookie; just refresh
    // the session here. Verifying twice would consume the OTP and fail.
    await checkAuth();
  };

  const handleUpload = async (file: File, periodStart: string, periodEnd: string) => {
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("periodStart", periodStart);
      form.append("periodEnd", periodEnd);
      const res = await fetch(`${OCI_API_BASE}/api/admin/documents`, {
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
    return <LoginScreen onLogin={handleSendCode} error={error} />;
  }

  if (view === "otp") {
    return (
      <OTPScreen
        email={otpEmail}
        onVerify={handleVerify}
        onBack={() => { setView("login"); setOtpEmail(""); }}
        error={error}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">لوحة تحكم EGX</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">التقارير الربعية</span>
            <span className="text-sm text-gray-500">{session?.user?.email || ""}</span>
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition"
            >
              رفع تقرير جديد
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
          </div>
        )}

        {view === "list" && (
          <DocumentsList
            documents={documents}
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