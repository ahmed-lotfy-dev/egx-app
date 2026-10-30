import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_NIM_MODEL: z.string().default("nvidia/nemotron-3-ultra-550b-a55b"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
};