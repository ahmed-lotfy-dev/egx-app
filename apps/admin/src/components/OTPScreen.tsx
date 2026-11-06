import { useState, useEffect, useRef } from "react";
import { Button } from "./Button";
import { BrandMark } from "./BrandMark";

import { OCI_API_BASE } from "../config";
const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

interface Props {
  email: string;
  onVerify: (email: string, otp: string) => void;
  onBack: () => void;
  error?: string | null;
}

export function OTPScreen({ email, onVerify, onBack, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(error ?? null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  const handleVerify = async () => {
    if (code.length !== CODE_LENGTH) return;

    setLocalError(null);
    setVerifying(true);

    try {
      const res = await fetch(`${OCI_API_BASE}/api/auth/sign-in/email-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "رمز غير صحيح");
      onVerify(email, code);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "فشل التحقق");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || resending) return;

    setLocalError(null);
    setResending(true);

    try {
      const res = await fetch(`${OCI_API_BASE}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "sign-in" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "فشل إعادة الإرسال");
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "فشل إعادة الإرسال");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-8">
          <BrandMark />
          <button
            onClick={onBack}
            className="h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 transition"
            aria-label="العودة"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className="mb-8">
          <h1 className="font-display text-[30px] leading-[38px] text-gray-900 text-center">
            أدخل رمز التحقق
          </h1>
          <p className="mt-3 font-body text-[15px] leading-6 text-gray-500 text-center">
            أرسلنا رمزاً إلى <span className="font-medium">{email}</span>
          </p>
        </div>

        <div className="flex justify-center gap-2 mb-6" style={{ direction: "ltr" }} onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: CODE_LENGTH }).map((_, index) => {
            const isActive = index === code.length;
            const digit = code[index] ?? "";

            return (
              <div
                key={index}
                className={`flex h-14 w-12 items-center justify-center rounded-xl border bg-gray-50 ${
                  isActive ? "border-amber-500" : "border-gray-200"
                }`}
              >
                <span className="font-display text-[22px] text-gray-900">{digit}</span>
              </div>
            );
          })}
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH));
              setLocalError(null);
            }}
            maxLength={CODE_LENGTH}
            autoComplete="one-time-code"
            className="absolute w-px h-px opacity-0 pointer-events-none"
            inputMode="numeric"
          />
        </div>

        {localError && (
          <p className="mb-4 text-center font-body text-[13px] text-red-600">{localError}</p>
        )}

        <div className="space-y-4">
          <Button
            onClick={handleVerify}
            loading={verifying}
            disabled={code.length !== CODE_LENGTH}
            fullWidth
          >
            {verifying ? "جاري التحقق..." : "تحقق"}
          </Button>

          <button
            onClick={handleResend}
            disabled={secondsLeft > 0 || resending}
            className="w-full items-center py-2 text-center active:opacity-70 transition"
          >
            <span className={`font-body text-[13px] ${secondsLeft > 0 ? "text-gray-400" : "text-amber-600"}`}>
              {secondsLeft > 0
                ? `إعادة الإرسال خلال ${secondsLeft}s`
                : resending
                  ? "جاري الإرسال..."
                  : "إعادة إرسال الرمز"}
            </span>
          </button>

          <button
            onClick={onBack}
            className="w-full items-center py-1 text-center active:opacity-70 transition"
          >
            <span className="font-body text-[13px] text-gray-400">تغيير البريد الإلكتروني</span>
          </button>
        </div>
      </div>
    </div>
  );
}