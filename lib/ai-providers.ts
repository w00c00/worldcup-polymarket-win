import "server-only";
import { getDb, type AiProvider } from "./db";
import { decryptSecret } from "./secrets";

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatOptions = {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export function listAiProviders(): AiProvider[] {
  return getDb().prepare("SELECT * FROM ai_providers ORDER BY is_default DESC, id ASC").all() as AiProvider[];
}

export function activeAiProvider(): AiProvider | null {
  const row = getDb()
    .prepare("SELECT * FROM ai_providers WHERE enabled = 1 ORDER BY is_default DESC, id ASC LIMIT 1")
    .get() as AiProvider | undefined;
  if (row && decryptSecret(row.api_key_enc)) return row;
  if (process.env.MINIMAX_API_KEY) {
    return {
      id: 0,
      name: "MiniMax 环境变量",
      provider_type: "minimax-cn",
      base_url: process.env.MINIMAX_BASE_URL || "https://api.minimax.chat",
      api_key_enc: process.env.MINIMAX_API_KEY,
      model: process.env.MINIMAX_MODEL || "MiniMax-Text-01",
      enabled: 1,
      is_default: 1,
      config_json: "{}",
      created_at: "",
      updated_at: "",
    };
  }
  return null;
}

export async function chatWithActiveProvider(messages: AiMessage[], options: ChatOptions = {}): Promise<string> {
  const provider = activeAiProvider();
  if (!provider) throw new Error("AI Provider 尚未配置 API Key");
  return chatWithProvider(provider, messages, options);
}

export async function chatWithProvider(provider: AiProvider, messages: AiMessage[], options: ChatOptions = {}): Promise<string> {
  const key = provider.id === 0 ? provider.api_key_enc : decryptSecret(provider.api_key_enc);
  if (!key) throw new Error(`${provider.name} 未配置 API Key`);
  if (provider.provider_type === "minimax-cn") {
    return minimaxChat(provider, key, messages, options);
  }
  return openAiCompatibleChat(provider, key, messages, options);
}

async function minimaxChat(provider: AiProvider, key: string, messages: AiMessage[], options: ChatOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
  try {
    const response = await fetch(`${provider.base_url.replace(/\/$/, "")}/v1/text/chatcompletion_v2`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        messages,
        max_tokens: options.maxTokens ?? 1400,
        temperature: options.temperature ?? 0.3,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${provider.name} HTTP ${response.status}`);
    const json = await response.json();
    return json?.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

async function openAiCompatibleChat(provider: AiProvider, key: string, messages: AiMessage[], options: ChatOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
  try {
    const base = provider.base_url.replace(/\/$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        messages,
        max_tokens: options.maxTokens ?? 1400,
        temperature: options.temperature ?? 0.3,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${provider.name} HTTP ${response.status}`);
    const json = await response.json();
    return json?.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}
