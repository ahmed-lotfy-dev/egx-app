import { Resend } from "resend";

import { env } from "../config/env";
import { logger } from "./logger";

type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export async function sendOtpEmail(input: { email: string; otp: string; type: OtpType }) {
  console.log('[sendOtpEmail] Input:', JSON.stringify(input));
  if (!env.RESEND_API_KEY) {
    logger.warn(
      { email: input.email, otp: input.otp, type: input.type },
      "RESEND_API_KEY is unset; email OTP printed to the development log",
    );
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
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
    throw new Error(`Resend rejected the OTP email: ${error.message}`);
  }
}
