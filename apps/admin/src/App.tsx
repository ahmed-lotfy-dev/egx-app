import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { DocumentsList } from "./components/DocumentsList";
import { DocumentDetail } from "./components/DocumentDetail";
import { LoginScreen } from "./components/LoginScreen";
import { OTPScreen } from "./components/OTPScreen";
import "./index.css";
import "./types/auth";

export interface Document {
  id: string;
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

import { OCI_API_BASE } from "./config";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

async function fetchWithAuth<T>(path: string): Promise<T> {
  const res = await fetch(`${OCI_API_BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || res.statusText);
  }
  return res.json();
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: session, isLoading, error } = useQuery<SessionData | null>({
    queryKey: ["session"],
    queryFn: async () => {
      const data = await fetch(`${OCI_API_BASE}/api/auth/get-session`, {
        credentials: "include",
      }).then((r) => r.json());
      const user = data?.user as { isAdmin?: boolean; email?: string } | undefined;
      return user?.isAdmin ? (data as SessionData) : null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && session === null && !error) {
      navigate("/login", { state: { from: location }, replace: true });
    }
  }, [isLoading, session, error, navigate, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-gray-500 text-sm">جاري التحقق من الجلسة...</p>
      </div>
    );
  }

  return session ? <>{children}</> : null;
}

function AppRoutes() {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data: documents, isLoading: docsLoading, refetch } = useQuery<Document[]>({
    queryKey: ["documents"],
    queryFn: () => fetchWithAuth<{ data: Document[] }>("/admin/documents").then((d) => d.data),
    staleTime: 30_000,
  });

  const handleSendCode = (email: string) => {
    navigate("/otp", { state: { email } });
  };

  const handleVerify = async (_email: string, _otp: string) => {
    setError(null);
    // OTPScreen already exchanged the code for a session cookie
    queryClient.invalidateQueries({ queryKey: ["session"] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
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
    queryClient.clear();
    navigate("/login", { replace: true });
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
              documents={documents ?? []}
              isLoading={docsLoading}
              error={error}
              onSetError={setError}
              onSelect={handleSelect}
              onSignOut={handleSignOut}
              onRefresh={refetch}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents/:id"
        element={
          <ProtectedRoute>
            <DashboardLayout
              documents={documents ?? []}
              isLoading={docsLoading}
              error={error}
              onSetError={setError}
              onSelect={handleSelect}
              onSignOut={handleSignOut}
              onRefresh={refetch}
            />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function DashboardLayout({
  documents,
  isLoading,
  error,
  onSetError,
  onSelect,
  onSignOut,
  onRefresh,
}: {
  documents: Document[];
  isLoading: boolean;
  error: string | null;
  onSetError: (error: string | null) => void;
  onSelect: (doc: Document) => void;
  onSignOut: () => void;
  onRefresh: () => void;
}) {
  const { data: session } = useQuery<SessionData | null>({
    queryKey: ["session"],
    queryFn: async () => {
      const data = await fetch(`${OCI_API_BASE}/api/auth/get-session`, {
        credentials: "include",
      }).then((r) => r.json());
      const user = data?.user as { isAdmin?: boolean; email?: string } | undefined;
      return user?.isAdmin ? (data as SessionData) : null;
    },
    staleTime: 5 * 60_000,
  });

  const location = useLocation();
  const isDetail = location.pathname.startsWith("/documents/");
  const docId = isDetail ? location.pathname.split("/")[2] : null;
  const selectedDoc = documents.find((d) => d.id === docId);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
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
            isLoading={isLoading}
            onRefresh={onRefresh}
            onSelect={onSelect}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}