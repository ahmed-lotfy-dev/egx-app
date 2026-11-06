import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { DocumentsList } from "./components/DocumentsList";
import { LoginScreen } from "./components/LoginScreen";
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
  const navigate = useNavigate();

  const { data: documents, isLoading: docsLoading, refetch } = useQuery<Document[]>({
    queryKey: ["documents"],
    queryFn: () => fetchWithAuth<{ data: Document[] }>("/admin/documents").then((d) => d.data),
    staleTime: 30_000,
  });

  const handleSelect = (doc: Document) => {
    navigate(`/documents/${doc.id}`);
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout
              documents={documents ?? []}
              isLoading={docsLoading}
              onSelect={handleSelect}
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
              onSelect={handleSelect}
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
  onSelect,
  onRefresh,
}: {
  documents: Document[];
  isLoading: boolean;
  onSelect: (doc: Document) => void;
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

  const navigate = useNavigate();

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
              onClick={handleSignOut}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <DocumentsList
          documents={documents}
          isLoading={isLoading}
          onRefresh={onRefresh}
          onSelect={onSelect}
        />
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;