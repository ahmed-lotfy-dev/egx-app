import { env } from "../config/env";

/**
 * Minimal NVIDIA NIM chat client (OpenAI-compatible endpoint). The worker has
 * its own richer copy for news analysis; the API only needs plain chat for
 * the market assistant.
 */

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
  timeoutMs?: number;
}

export interface NIMChatResponse {
  content: string;
  model: string;
}

export function aiConfigured(): boolean {
  return Boolean(env.NVIDIA_API_KEY);
}

export async function chat(options: NIMChatOptions): Promise<NIMChatResponse> {
  const { messages, maxTokens = 1200, temperature = 0.4, timeoutMs = 60_000 } = options;

  if (!env.NVIDIA_API_KEY) {
    throw new Error("NVIDIA_API_KEY not configured");
  }

  const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: NIM_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`NIM API error: ${response.status} ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    model?: string;
    choices: Array<{ message: { content: string } }>;
  };

  return {
    content: data.choices[0]?.message?.content ?? "",
    model: data.model ?? NIM_MODEL,
  };
}
