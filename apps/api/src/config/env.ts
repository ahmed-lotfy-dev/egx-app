import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  TRUSTED_ORIGINS: z.string().default("ahmedlotfy-egx-app://,http://localhost:8081"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("EGX <no-reply@example.com>"),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_NIM_MODEL: z.string().optional(),
  NVIDIA_NIM_EMBEDDING_MODEL: z.string().optional(),
  DOCUMENTS_DIR: z.string().default("./.data/egx"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

/**
 * Web clients that are always allowed, independent of the TRUSTED_ORIGINS
 * env var. Keeping them here means CORS and better-auth read the exact same
 * list, so a browser origin can never pass one check and fail the other.
 */
const WEB_TRUSTED_ORIGINS = [
  "https://egx-api.alotfy.site",
];

export const env = {
  ...parsed.data,
  trustedOrigins: [
    ...new Set([
      ...parsed.data.TRUSTED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      ...WEB_TRUSTED_ORIGINS,
    ]),
  ],
};
