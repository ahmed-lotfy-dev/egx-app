import { Resend } from "resend";

import { env } from "../config/env";
import { logger } from "./logger";

type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export async function sendOtpEmail(input: { email: string; otp: string; type: OtpType }) {
  console.log('[sendOtpEmail] Input:', JSON.stringify(input));
  
  // If no API key or it's a placeholder, just log OTP to console (dev mode)
  const apiKey = env.RESEND_API_KEY?.trim();
  const isPlaceholder = !apiKey || apiKey === "re_placeholder" || apiKey === "re_123456789" || apiKey.startsWith("re_test");
  
  if (!apiKey || isPlaceholder) {
    logger.warn(
      { email: input.email, otp: input.otp, type: input.type },
      "RESEND_API_KEY is unset or placeholder; email OTP printed to the development log",
    );
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.email,
    subject: `رمز الدخول إلى EGX: ${input.otp}`,
    text: [
      "رمز الدخول الخاص بك إلى تطبيق البورصة المصرية:",
      input.otp,
      "",
      "الرمز صالح لمدة 10 دقائق. إذا لم تطلبه، تجاهل هذه الرسالة.",
      "",
      `Your EGX sign-in code is ${input.otp}. It expires in 10 minutes.`,
    ].join("\n"),
  });

  if (error) {
    // Don't throw - just log the error and continue (OTP still valid in DB)
    logger.error(
      { email: input.email, error: error.message },
      "Resend rejected the OTP email; OTP logged to console as fallback"
    );
    console.log('[sendOtpEmail] Fallback OTP for', input.email, ':', input.otp);
    return;
  }
}
