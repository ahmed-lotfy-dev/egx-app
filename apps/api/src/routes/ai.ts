import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { AiChatRequestSchema, AiChatResponseSchema, ErrorResponseSchema } from "@egx/contracts";

import { buildMarketContext, buildTickerContext } from "../lib/ai-context";
import { aiConfigured, chat as nimChat, type NIMMessage } from "../lib/nim";

/**
 * Market assistant. Every request is grounded: the system prompt carries a
 * snapshot of the app's own data (quote, levels, fundamentals, news — or the
 * market overview when no ticker is set) and the model is instructed to never
 * invent numbers. Stateless — the client sends the conversation each time.
 */

const MAX_CONTEXT_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2000;

/** Tiny per-IP limiter so a runaway client can't burn the NIM quota. */
const RATE_LIMIT = { windowMs: 60_000, max: 12 } as const;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT.windowMs)) hits.delete(key);
    }
  }
  return false;
}

const SYSTEM_PROMPT_BASE = `You are "مساعد EGX" — the in-app financial assistant of an Egyptian stock market app. You help retail investors and traders understand the Egyptian Exchange (EGX), macro indicators, and the news the app ingests.

Rules:
- Reply in Arabic when locale=ar (clear Egyptian-friendly Modern Standard Arabic) and in English when locale=en.
- Ground EVERY number in the MARKET DATA block provided below. Never invent prices, percentages, dates, or news. If the data block lacks something, say so plainly.
- EGX quotes are delayed ~15–20 minutes by the exchange; respect the asOf timestamps and mention freshness when it matters.
- Be concise: at most ~180 words, prefer short bullet points, always use ticker symbols (e.g. COMI, EAST).
- You may explain general financial concepts (P/E, support/resistance, dividend yield) without data.
- Frame everything as analysis and education, never as a guaranteed prediction or an instruction to trade.
- End every answer with one short line reminding the user this is not investment advice (in the reply language).`;

const chatRoute = createRoute({
  method: "post",
  path: "/api/ai/chat",
  tags: ["ai"],
  summary: "Ask the market assistant (grounded in live app data)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: AiChatRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Assistant reply",
      content: {
        "application/json": {
          schema: AiChatResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid conversation",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    429: {
      description: "Rate limited",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    503: {
      description: "AI provider unavailable",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export const aiRoutes = new OpenAPIHono();

aiRoutes.openapi(chatRoute, async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return c.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests — slow down a little." } },
      429,
    );
  }

  if (!aiConfigured()) {
    return c.json(
      { error: { code: "AI_UNAVAILABLE", message: "The assistant is not configured." } },
      503,
    );
  }

  const { messages: rawMessages, ticker, locale } = c.req.valid("json");

  const last = rawMessages[rawMessages.length - 1];
  if (!last || last.role !== "user") {
    return c.json(
      { error: { code: "INVALID_CONVERSATION", message: "The last message must be from the user." } },
      400,
    );
  }

  const history: NIMMessage[] = rawMessages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_MESSAGE_CHARS),
    }));

  let grounding: Awaited<ReturnType<typeof buildMarketContext>>;
  if (ticker) {
    grounding = (await buildTickerContext(ticker)) ?? {
      text: `The user asked about ticker "${ticker}" but it does not exist in the app's instrument database. Tell them politely (in their language) that no EGX listing matches it, and suggest checking the spelling.`,
      ticker: null,
    };
  } else {
    grounding = await buildMarketContext();
  }

  const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\nlocale=${locale}\n\nMARKET DATA (app snapshot, may be delayed):\n${grounding.text}`;

  try {
    const response = await nimChat({
      messages: [{ role: "system", content: systemPrompt }, ...history],
      maxTokens: 1200,
      temperature: 0.4,
      timeoutMs: 60_000,
    });

    if (!response.content.trim()) {
      return c.json(
        { error: { code: "AI_EMPTY", message: "The assistant returned an empty answer." } },
        503,
      );
    }

    return c.json(
      {
        data: {
          message: { role: "assistant" as const, content: response.content.trim() },
          groundedTicker: grounding.ticker,
        },
        meta: { model: response.model, grounded: ticker !== undefined },
      },
      200,
    );
  } catch (error) {
    console.error(
      "[ai] chat failed:",
      error instanceof Error ? error.message : error,
    );
    return c.json(
      { error: { code: "AI_UNAVAILABLE", message: "The assistant is temporarily unavailable." } },
      503,
    );
  }
});
