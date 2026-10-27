import { z } from "zod";

export const StatusResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  time: z.iso.datetime(),
  database: z.enum(["up", "down"]),
});

export type StatusResponse = z.infer<typeof StatusResponseSchema>;
