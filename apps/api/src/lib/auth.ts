import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "../config/env";
import { db } from "../db/client";
import * as schema from "../db/schema";

const isProd = env.NODE_ENV === "production";

export const auth = betterAuth({
  appName: "EGX",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  trustedOrigins: [
    ...env.trustedOrigins,
    "http://localhost:5173",
    "https://egx-app.alotfy.site",
    "https://egx.alotfy.site",
  ],
  advanced: {
    defaultCookieAttributes: {
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      // No domain in development - allows cookie sharing across localhost ports
      domain: isProd ? ".alotfy.site" : undefined,
    },
    crossSubDomainCookies: {
      enabled: isProd,
      domain: isProd ? ".alotfy.site" : undefined,
    },
  },
  emailAndPassword: {
    enabled: false,
  },
  user: {
    additionalFields: {
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
            // API's callback endpoint (where Google redirects after OAuth)
            callbackURL: `${env.BETTER_AUTH_URL}/api/auth/callback/google`,
          },
        },
      }
    : {}),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 30,
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
  },
  plugins: [
    expo(),
  ],
});