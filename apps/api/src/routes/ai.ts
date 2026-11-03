import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { AiChatRequestSchema, AiChatResponseSchema, ErrorResponseSchema } from "@egx/contracts";

import { buildCatalog, buildMarketContext, buildTickerContext, resolveMentionedTicker } from "../lib/ai-context";
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
- If the user asks about a stock that is NOT in the MARKET DATA block, do NOT claim it does not exist. Say you can only see the data the app gave you for this turn and ask them to open that stock's screen (or give its ticker) so the app loads its data — then answer from that.
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

  // The user may name a stock in the message itself ("KORA", "بوقير") even
  // when no ticker context was passed. Resolve that mention so the answer is
  // grounded on the right instrument instead of the generic market overview.
  const lastUser = [...rawMessages].reverse().find((message) => message.role === "user");
  const mentioned = lastUser ? await resolveMentionedTicker(lastUser.content) : null;
  const effectiveTicker = mentioned ?? ticker;

  // Market-wide chats carry the full listing catalog so the model can map a
  // user's phrasing (Arabic names we have no nameAr for, transliterations,
  // typos) onto a ticker and ask for a grounded re-run via [[GROUND:TICKER]].
  const catalog = effectiveTicker ? null : await buildCatalog();

  const systemPromptFor = (groundingText: string, withCatalog: boolean) =>
    `${SYSTEM_PROMPT_BASE}\n\nlocale=${locale}\n\nMARKET DATA (app snapshot, may be delayed):\n${groundingText}${
      withCatalog
        ? `\n\nINSTRUMENT CATALOG (every listing the app has, ticker=English name | Arabic name):\n${catalog}\n\nIf the user asks about a stock that is in the CATALOG but NOT in MARKET DATA above, reply with exactly [[GROUND:TICKER]] (the ticker from the catalog) and nothing else — the app will then load that stock's data and ask you again. This is an internal protocol; never mention it to the user.`
        : ""
    }`;

  let grounding: Awaited<ReturnType<typeof buildMarketContext>>;
  if (effectiveTicker) {
    grounding = (await buildTickerContext(effectiveTicker)) ?? {
      text: `The user asked about ticker "${effectiveTicker}" but no matching EGX instrument was found in the app's database. Politely say (in their language) that the app has no data for it and suggest checking the spelling or opening the stock's screen.`,
      ticker: null,
    };
  } else {
    grounding = await buildMarketContext();
  }

  const callModel = (groundingText: string, withCatalog: boolean) =>
    nimChat({
      messages: [{ role: "system", content: systemPromptFor(groundingText, withCatalog) }, ...history],
      maxTokens: 1200,
      temperature: 0.4,
      timeoutMs: 60_000,
    });

  try {
    let response = await callModel(grounding.text, catalog !== null);
    let groundedTicker = grounding.ticker;

    // The model asked for a different stock than the one we grounded — load
    // its data and answer for real. One re-ground pass, no loops.
    const requested = response.content.match(/\[\[GROUND:([A-Za-z0-9]{1,10})\]\]/);
    if (requested && requested[1]!.toUpperCase() !== groundedTicker) {
      const wanted = requested[1]!.toUpperCase();
      const context = await buildTickerContext(wanted);
      if (context) {
        response = await callModel(context.text, false);
        groundedTicker = context.ticker;
      }
    }

    const content = response.content.replace(/\[\[GROUND:[A-Za-z0-9]+\]\]/g, "").trim();
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
