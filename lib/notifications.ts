import "server-only";
import { ensureNotificationSettings, getDb } from "./db";
import { decryptSecret } from "./secrets";

type SendResult = {
  channel: "telegram" | "serverchan";
  status: "sent" | "failed" | "skipped";
  error?: string;
};

const SEND_TIMEOUT_MS = 8000;

export async function sendUserNotifications(userId: number, title: string, body: string): Promise<SendResult[]> {
  const settings = ensureNotificationSettings(userId);
  const results: SendResult[] = [];
  const sendTasks: Promise<SendResult>[] = [];

  if (settings.telegram_enabled) {
    const token = decryptSecret(settings.telegram_bot_token_enc);
    if (token && settings.telegram_chat_id) {
      sendTasks.push(sendTelegram(token, settings.telegram_chat_id, `${title}\n\n${body}`));
    } else {
      results.push({ channel: "telegram", status: "skipped", error: "Telegram token/chat_id 未配置完整" });
    }
  }

  if (settings.serverchan_enabled) {
    const sendkey = decryptSecret(settings.serverchan_sendkey_enc);
    if (sendkey) {
      sendTasks.push(sendServerChan(sendkey, title, body));
    } else {
      results.push({ channel: "serverchan", status: "skipped", error: "Server 酱 SendKey 未配置" });
    }
  }

  if (sendTasks.length) {
    results.push(...(await Promise.all(sendTasks)));
  }

  if (!results.length) {
    results.push({ channel: "telegram", status: "skipped", error: "未启用任何推送通道" });
  }

  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO push_logs (user_id, channel, title, body, status, error) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const result of results) {
    stmt.run(userId, result.channel, title, body, result.status, result.error ?? "");
  }
  return results;
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<SendResult> {
  try {
    const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 3900),
        disable_web_page_preview: true,
      }),
    });
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}: ${await response.text()}`);
    return { channel: "telegram", status: "sent" };
  } catch (error) {
    return { channel: "telegram", status: "failed", error: errorMessage(error) };
  }
}

async function sendServerChan(sendkey: string, title: string, desp: string): Promise<SendResult> {
  try {
    const response = await fetchWithTimeout(`https://sctapi.ftqq.com/${sendkey}.send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.slice(0, 120), desp }),
    });
    if (!response.ok) throw new Error(`ServerChan HTTP ${response.status}: ${await response.text()}`);
    const json = await response.json().catch(() => null);
    if (json && Number(json.code) !== 0) throw new Error(json.message || "Server 酱返回失败");
    return { channel: "serverchan", status: "sent" };
  } catch (error) {
    return { channel: "serverchan", status: "failed", error: errorMessage(error) };
  }
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return `推送请求超时（${SEND_TIMEOUT_MS / 1000} 秒）`;
  }
  return error instanceof Error ? error.message : String(error);
}
