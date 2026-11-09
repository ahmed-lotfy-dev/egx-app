import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { AiChatRequestSchema, AiChatResponseSchema, ErrorResponseSchema } from "@egx/contracts";

import { buildMarketContext, buildTickerContext, resolveMentionedTicker } from "../lib/ai-context";
import { aiConfigured, chat as nimChat, type NIMMessage } from "../lib/nim";
import { searchRagForChat, formatRagContext } from "../lib/ai-rag";

/**
 * Market assistant. Every request is grounded: the system prompt carries a
 * snapshot of the app's own data (quote, levels, fundamentals, news — or the
 * market overview when no ticker is set) and the model is instructed to never
 * invent numbers. Stateless — the client sends the conversation each time.
 */

// Prefill dominates latency on the 550B NIM model — keep history tight or the
// request healthily exceeds any sane timeout (observed 90s+ 503s).
const MAX_CONTEXT_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 1200;

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

const SYSTEM_PROMPT_BASE = `You are "مساعد EGX" — the in-app financial analyst for Egyptian stock market investors. You provide data-grounded, actionable investment analysis combining live market data, company fundamentals, news sentiment, AND official EGX disclosure documents (RAG).

Rules:
- Reply in Arabic when locale=ar (clear Egyptian-friendly Modern Standard Arabic) and in English when locale=en.
- Ground EVERY number in the MARKET DATA and RAG CONTEXT blocks below. Never invent prices, percentages, dates, or news. If data is missing, say so plainly.
- EGX quotes are delayed ~15–20 minutes by the exchange; respect the asOf timestamps.
- Be concise but thorough: ~250 words max, use bullet points, always use ticker symbols (e.g. COMI, EAST).
- Provide a CLEAR INVESTMENT VERDICT: 🟢 BUY / 🟡 HOLD / 🔴 SELL with reasoning.
- Structure your answer:
  1. **Quick Verdict** (Buy/Hold/Sell + 1-line reason)
  2. **Fundamental Health** (Profitability, Valuation, Dividends, Balance Sheet)
  3. **Technical / Price Action** (Trend, Support/Resistance, Volume)
  4. **News & Catalysts** (Recent news sentiment, upcoming events)
  5. **Disclosure Insights** (Key findings from EGX filings/RAG)
  6. **Risk Factors** (What could go wrong)
  7. **Final Recommendation** with price targets if applicable
- Frame as analysis/education, not guaranteed prediction. End with "هذا تحليل تعليمي وليس توصية استثمارية." (or English equivalent).
- When the user gives their own trades, compute the average cost as NET cost basis: total money spent minus money received from sales, divided by shares currently held. Verify the division explicitly.`;

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

  // The user may name a stock in the message itself ("KORA", "بوقير") even
  // when no ticker context was passed. Resolve that mention so the answer is
  // grounded on the right instrument instead of the generic market overview.
  const lastUser = [...rawMessages].reverse().find((message) => message.role === "user");
  const mentioned = lastUser ? await resolveMentionedTicker(lastUser.content) : null;
  const effectiveTicker = mentioned ?? ticker;

  const systemPromptFor = (groundingText: string, ragContext: string) =>
    `${SYSTEM_PROMPT_BASE}\n\nlocale=${locale}\n\nMARKET DATA (app snapshot, may be delayed):\n${groundingText}${ragContext ? `\n\n${ragContext}` : ""}`;

  let grounding: Awaited<ReturnType<typeof buildMarketContext>>;
  if (effectiveTicker) {
    grounding = (await buildTickerContext(effectiveTicker)) ?? {
      text: `The user asked about ticker "${effectiveTicker}" but no matching EGX instrument was found in the app's database. Politely say (in their language) that the app has no data for it and suggest checking the spelling or opening the stock's screen.`,
      ticker: null,
    };
  } else {
    grounding = await buildMarketContext();
  }

  // RAG: ALWAYS search document pages for relevant context from uploaded EGX disclosure documents
  const lastUserMessage = lastUser?.content ?? "";
  let ragContext = "";
  
  try {
    const { context: ragContextText, results } = await searchRagForChat(lastUserMessage, {
      limit: 8,
      similarityThreshold: 0.15,
    });
    ragContext = formatRagContext(results);
  } catch (e) {
    console.warn("[ai] RAG search failed:", e);
  }

  const callModel = (groundingText: string, ragText: string, maxTokens: number, timeoutMs: number) =>
    nimChat({
      messages: [{ role: "system", content: systemPromptFor(groundingText, ragText) }, ...history],
      maxTokens,
      temperature: 0.3,
      timeoutMs,
    });

  try {
    let response: Awaited<ReturnType<typeof nimChat>>;
    try {
      // Full attempt: RAG + full history. Generation on nemotron-3-ultra-550b
      // regularly takes 60–120s, so give it real headroom before killing it.
      response = await callModel(grounding.text, ragContext, 1800, 150_000);
    } catch (firstError) {
      // One compact retry without RAG context so the user gets an answer even
      // when the full prompt blows the latency budget (was 503 elbow).
      console.warn(
        "[ai] chat attempt 1 failed, falling back to compact prompt:",
        firstError instanceof Error ? firstError.message : firstError,
      );
      response = await callModel(
        grounding.text,
        "",
        700,
        120_000,
      );
    }
    let groundedTicker = grounding.ticker;

    const content = response.content.trim();
    if (!content) {
      return c.json(
        { error: { code: "AI_EMPTY", message: "The assistant returned an empty answer." } },
        503,
      );
    }

    return c.json(
      {
        data: {
          message: { role: "assistant" as const, content },
          groundedTicker,
        },
        meta: { model: response.model, grounded: effectiveTicker !== undefined },
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
