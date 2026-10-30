import { env } from "../config/env";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NIM_MODEL = env.NVIDIA_NIM_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b";

export interface NIMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface NIMChatOptions {
  messages: NIMMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json_object";
}

export interface NIMChatResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface NewsAnalysisResult {
  summary: string;
  keyPoints: string[];
  sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  impactScore: number; // 0-100
  impactLevel: "critical" | "high" | "medium" | "low";
  entities: {
    tickers: string[];
    sectors: string[];
    countries: string[];
    people: string[];
    companies: string[];
  };
  tradingSignals: string[];
  translatedTitle?: string;
  translatedSummary?: string;
}

async function nimFetch<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY not configured");
  }

  const response = await fetch(`${NIM_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NIM API error: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export async function chat(options: NIMChatOptions): Promise<NIMChatResponse> {
  const { messages, maxTokens = 2000, temperature = 0.3, responseFormat } = options;

  const data = await nimFetch<{ choices: Array<{ message: { content: string } }>; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }>("/chat/completions", {
    model: NIM_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
    ...(responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
  });

  const content = data.choices[0]?.message?.content ?? "";

  return {
    content,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
  };
}

export async function analyzeNews(
  title: string,
  summary: string | null,
  lang: "ar" | "en",
  sourceRegion: string,
  sourceCategory: string,
): Promise<NewsAnalysisResult> {
  const prompt = buildAnalysisPrompt(title, summary, lang, sourceRegion, sourceCategory);

  const response = await chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    maxTokens: 3000,
    temperature: 0.2,
    responseFormat: "json_object",
  });

  return parseAnalysisResponse(response.content, lang);
}

const SYSTEM_PROMPT = `You are a financial news analyst for the Egyptian Stock Exchange (EGX). Analyze news articles and extract structured information for traders and investors.

Output ONLY valid JSON with this exact structure:
{
  "summary": "string - 2-3 sentence Arabic summary",
  "keyPoints": ["string", "string", ...],
  "sentiment": "bullish|bearish|neutral|mixed",
  "impactScore": 0-100,
  "impactLevel": "critical|high|medium|low",
  "entities": {
    "tickers": ["EGX ticker symbols like COMI, EAST, etc."],
    "sectors": ["banking", "real_estate", "telecommunications", ...],
    "countries": ["Egypt", "Saudi Arabia", "UAE", ...],
    "people": ["person names"],
    "companies": ["company names"]
  },
  "tradingSignals": ["earnings", "dividend", "merger", "regulatory", "analyst_rating", "guidance", "buyback", "split", "default_risk", "geopolitical"],
  "translatedTitle": "string - Arabic title if original was English, English if original was Arabic",
  "translatedSummary": "string - Arabic summary if original was English, English if original was Arabic"
}

Guidelines:
- impactScore: 0-100 based on source credibility, entity relevance, recency, market impact potential
- impactLevel: critical(90+), high(70-89), medium(40-69), low(<40)
- sentiment: based on price impact direction for mentioned stocks
- tradingSignals: only include if explicitly mentioned or strongly implied
- tickers: use EGX ticker format (e.g., COMI, EAST, CIB)
- Translate between Arabic and English as needed`;

function buildAnalysisPrompt(
  title: string,
  summary: string | null,
  lang: "ar" | "en",
  sourceRegion: string,
  sourceCategory: string,
): string {
  const text = summary ? `${title}\n\n${summary}` : title;

  return `Analyze this financial news article:

Title: ${title}
Content: ${text}
Language: ${lang}
Source Region: ${sourceRegion}
Source Category: ${sourceCategory}

Provide the structured analysis as JSON.`;
}

function parseAnalysisResponse(content: string, fallbackLang: "ar" | "en"): NewsAnalysisResult {
  try {
    const parsed = JSON.parse(content);

    // Validate and sanitize
    return {
      summary: parsed.summary ?? "",
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5) : [],
      sentiment: ["bullish", "bearish", "neutral", "mixed"].includes(parsed.sentiment) ? parsed.sentiment : "neutral",
      impactScore: Math.max(0, Math.min(100, Number(parsed.impactScore) ?? 0)),
      impactLevel: ["critical", "high", "medium", "low"].includes(parsed.impactLevel) ? parsed.impactLevel : "low",
      entities: {
        tickers: Array.isArray(parsed.entities?.tickers) ? parsed.entities.tickers.filter((t: string) => typeof t === "string").slice(0, 10) : [],
        sectors: Array.isArray(parsed.entities?.sectors) ? parsed.entities.sectors.slice(0, 10) : [],
        countries: Array.isArray(parsed.entities?.countries) ? parsed.entities.countries.slice(0, 10) : [],
        people: Array.isArray(parsed.entities?.people) ? parsed.entities.people.slice(0, 10) : [],
        companies: Array.isArray(parsed.entities?.companies) ? parsed.entities.companies.slice(0, 10) : [],
      },
      tradingSignals: Array.isArray(parsed.tradingSignals) ? parsed.tradingSignals.filter((s: string) => typeof s === "string").slice(0, 10) : [],
      translatedTitle: parsed.translatedTitle,
      translatedSummary: parsed.translatedSummary,
    };
  } catch (error) {
    console.error("[NIM] Failed to parse analysis response:", error);
    return {
      summary: "",
      keyPoints: [],
      sentiment: "neutral",
      impactScore: 0,
      impactLevel: "low",
      entities: { tickers: [], sectors: [], countries: [], people: [], companies: [] },
      tradingSignals: [],
    };
  }
}

export async function translateText(text: string, targetLang: "ar" | "en"): Promise<string> {
  if (!text || text.trim().length === 0) return "";

  const prompt = `Translate this financial text to ${targetLang === "ar" ? "Arabic" : "English"}. Preserve financial terminology, numbers, and proper nouns. Output ONLY the translation, no explanation.

Text: ${text}`;

  const response = await chat({
    messages: [
      { role: "system", content: "You are a professional financial translator." },
      { role: "user", content: prompt },
    ],
    maxTokens: 1000,
    temperature: 0.1,
  });

  return response.content.trim();
}