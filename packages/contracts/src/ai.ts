import { z } from "zod";

export const AiChatRoleSchema = z.enum(["user", "assistant"]);
export type AiChatRole = z.infer<typeof AiChatRoleSchema>;

export const AiChatMessageSchema = z.object({
  role: AiChatRoleSchema,
  content: z.string().min(1).max(4000),
});
export type AiChatMessage = z.infer<typeof AiChatMessageSchema>;

export const AiChatRequestSchema = z.object({
  /** Full conversation so far, oldest first. The last message must be from the user. */
  messages: z.array(AiChatMessageSchema).min(1).max(24),
  /** Optional stock context — grounds the assistant in that instrument's data. */
  ticker: z.string().trim().min(1).max(20).optional(),
  locale: z.enum(["ar", "en"]).default("ar"),
});
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

export const AiChatResponseSchema = z.object({
  data: z.object({
    message: AiChatMessageSchema,
    /** The ticker actually grounded, or null when the chat is market-wide. */
    groundedTicker: z.string().nullable(),
  }),
  meta: z.object({
    model: z.string(),
    /** True when live instrument data was injected into the prompt. */
    grounded: z.boolean(),
  }),
});
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;
