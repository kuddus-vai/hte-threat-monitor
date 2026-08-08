/**
 * Ollama client — local, free LLM inference (zero-cost constraint).
 * Talks to the OpenAI-compatible /api/chat endpoint on 127.0.0.1:11434.
 */
import { config } from "../config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function ollamaChat(
  messages: ChatMessage[],
  opts: { temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { temperature = 0.1, timeoutMs = 90_000 } = opts;
  const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages,
      stream: false,
      options: { temperature },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

export async function ollamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
