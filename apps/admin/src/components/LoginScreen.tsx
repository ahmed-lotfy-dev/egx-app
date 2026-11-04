import { useState, FormEvent, useRef } from "react";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { BrandMark } from "./BrandMark";

const OCI_API_BASE = "https://egx-api.alotfy.site";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({ onLogin, error }: { onLogin: (email: string) => void; error: string | null }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(error ?? null);
  const emailRef = useRef<HTMLInputElement>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = emailPattern.test(normalizedEmail) && !sending;

  const handleSendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSending(true);
    setLocalError(null);

    try {
      const res = await fetch(`${OCI_API_BASE}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, type: "sign-in" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "فشل إرسال الرمز");
      onLogin(normalizedEmail);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "فشل إرسال الرمز");
    } finally {
      setSending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setLocalError(null);

    try {
      const res = await fetch(`${OCI_API_BASE}/api/auth/sign-in/social`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: window.location.origin,
          errorCallbackURL: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "فشل تسجيل الدخول بحساب جوجل");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "فشل تسجيل الدخول بحساب جوجل");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-10">
          <BrandMark />
          <h1 className="mt-4 font-display text-[30px] leading-[38px] text-gray-900">
            تسجيل الدخول
          </h1>
          <p className="mt-2 font-body text-[15px] leading-6 text-gray-500">
            أدخل بريدك الإلكتروني لإرسال رمز التحقق
          </p>
        </div>

        {localError && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {localError}
          </div>
        )}

        <form onSubmit={handleSendCode} className="space-y-5">
          <TextField
            ref={emailRef}
            label="البريد الإلكتروني"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setLocalError(null);
            }}
            placeholder="admin@egx.app"
            type="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            textContentType="emailAddress"
            error={localError ?? undefined}
            onSubmitEditing={handleSendCode}
          />

          <Button
            onClick={handleSendCode}
            loading={sending}
            disabled={!canSubmit}
            fullWidth
          >
            {sending ? "جاري الإرسال..." : "إرسال الرمز"}
          </Button>
        </form>

        <div className="mt-6">
          <div className="flex items-center gap-4 my-6">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="font-label text-[12px] text-gray-400">أو المتابعة بـ</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <Button
            variant="secondary"
            onClick={handleGoogleSignIn}
            loading={googleLoading}
            fullWidth
            leftIcon={
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            }
          >
            Google
          </Button>
        </div>
      </div>
    </div>
  );
}