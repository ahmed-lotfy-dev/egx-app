import { useState, FormEvent } from "react";

interface Props {
  onLogin: (email: string, otp: string) => void;
  loading: boolean;
  error: string | null;
}

export function LoginScreen({ onLogin, loading, error }: Props) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === "email") {
      // In real app, this would call send-otp; for now just advance
      setStep("otp");
    } else {
      onLogin(email, otp);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">لوحة تحكم EGX</h1>
          <p className="text-gray-500 mt-2">إدارة التقارير الربعية للسوق</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === "email" && (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                البريد الإلكتروني
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="admin@egx.app"
              />
            </div>
          )}

          {step === "otp" && (
            <>
              <p className="text-sm text-gray-500 text-center">
                تم إرسال رمز التحقق إلى <strong>{email}</strong>
              </p>
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">
                  رمز التحقق
                </label>
                <input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-center text-2xl tracking-widest"
                  placeholder="••••••"
                  autoComplete="one-time-code"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "جاري التحقق..." : step === "email" ? "إرسال الرمز" : "دخول"}
          </button>
        </form>

        {step === "otp" && (
          <button
            type="button"
            onClick={() => setStep("email")}
            className="mt-4 w-full text-sm text-primary-600 hover:text-primary-700"
          >
            تغيير البريد الإلكتروني
          </button>
        )}
      </div>
    </div>
  );
}
