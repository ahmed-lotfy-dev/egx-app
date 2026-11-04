import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
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

interface SessionData {
  user: { isAdmin: boolean; email: string } | null;
}

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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const data = await fetch(`${OCI_API_BASE}/api/auth/get-session`, {
          credentials: "include",
        }).then((r) => r.json());
        const user = data?.user as { isAdmin?: boolean; email?: string } | undefined;
        if (user?.isAdmin) {
          setSession(data as SessionData);
        } else {
          setSession(null);
          navigate("/login", { state: { from: location }, replace: true });
        }
      } catch {
        setSession(null);
        navigate("/login", { state: { from: location }, replace: true });
      } finally {
        setChecking(false);
      }
    };
    checkAuth();
  }, [navigate, location]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return session ? <>{children}</> : null;
}

function AppRoutes() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadDocuments = async () => {
    try {
      const data = await api("/admin/documents");
      setDocuments(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  };

  const handleSendCode = (email: string) => {
    navigate("/otp", { state: { email } });
  };

  const handleVerify = async (_email: string, _otp: string) => {
    setError(null);
    // OTPScreen already exchanged the code for a session cookie;
    // ProtectedRoute will pick it up on the next render.
    // Force a re-check by navigating to root (triggers ProtectedRoute checkAuth).
    navigate("/", { replace: true });
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
    navigate(`/documents/${doc.id}`);
  };

  const handleSignOut = async () => {
    try {
      await fetch(`${OCI_API_BASE}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    // ProtectedRoute will detect signed-out session and redirect to login
    navigate("/", { replace: true });
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginScreen onLogin={handleSendCode} error={error} />} />
      <Route
        path="/otp"
        element={
          <OTPScreen
            email={useLocation().state?.email ?? ""}
            onVerify={handleVerify}
            onBack={() => navigate("/login", { replace: true })}
            error={error}
          />
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout
              documents={documents}
              error={error}
              onSetError={setError}
              onUpload={handleUpload}
              onSelect={handleSelect}
              onSignOut={handleSignOut}
              onRefresh={loadDocuments}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents/:id"
        element={
          <ProtectedRoute>
            <DashboardLayout
              documents={documents}
              error={error}
              onSetError={setError}
              onUpload={handleUpload}
              onSelect={handleSelect}
              onSignOut={handleSignOut}
              onRefresh={loadDocuments}
            />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function DashboardLayout({
  documents,
  error,
  onSetError,
  onUpload,
  onSelect,
  onSignOut,
  onRefresh,
}: {
  documents: Document[];
  error: string | null;
  onSetError: (error: string | null) => void;
  onUpload: (file: File, periodStart: string, periodEnd: string) => void;
  onSelect: (doc: Document) => void;
  onSignOut: () => void;
  onRefresh: () => void;
}) {
  const [session, setSession] = useState<SessionData | null>(null);
  const location = useLocation();
  const isDetail = location.pathname.startsWith("/documents/");
  const docId = isDetail ? Number(location.pathname.split("/")[2]) : null;
  const selectedDoc = documents.find((d) => d.id === docId);

  useEffect(() => {
    fetch(`${OCI_API_BASE}/api/auth/get-session`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const user = data?.user as { isAdmin?: boolean; email?: string } | undefined;
        if (user?.isAdmin) setSession(data as SessionData);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">لوحة تحكم EGX</h1>
          <div className="flex items-center gap-4">
            {session?.user?.email && (
              <span className="text-sm text-gray-500">{session.user.email}</span>
            )}
            <button
              onClick={onSignOut}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => onSetError(null)} className="text-red-500 hover:text-red-700">×</button>
          </div>
        )}

        {isDetail && selectedDoc ? (
          <DocumentDetail
            document={selectedDoc}
            onRefresh={onRefresh}
          />
        ) : (
          <DocumentsList
            documents={documents}
            onUpload={onUpload}
            onSelect={onSelect}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}