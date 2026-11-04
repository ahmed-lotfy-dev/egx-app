import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";

import { env } from "../config/env";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { sendOtpEmail } from "./email";

export const auth = betterAuth({
  appName: "EGX",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  trustedOrigins: env.trustedOrigins,
  advanced: {
    // The dashboard is served from a different origin than the API
    // (egx.alotfy.site -> egx-api.alotfy.site, and the vercel.app alias).
    // Session cookies must be sent on those cross-origin requests.
    defaultCookieAttributes: {
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      secure: env.NODE_ENV === "production",
    },
  },
  emailAndPassword: {
    enabled: false,
  },
  user: {
    additionalFields: {
      // Exposed on the session user so the admin dashboard can decide whether
      // to show the console. `input: false` stops clients setting it.
      isAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        },
      }
    : {}),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
  },
  plugins: [
    // Required for OAuth in Expo Go: proxies the provider redirect back to the
    // app and trusts the exp:// development origins.
    expo(),
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp, type }) {
        await sendOtpEmail({ email, otp, type });
      },
    }),
  ],
});