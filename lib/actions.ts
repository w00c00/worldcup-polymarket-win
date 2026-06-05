"use server";

import { redirect } from "next/navigation";
import { createUser, requireAdmin, requireUser, signIn, signOut } from "./auth";
import { getDb, ensureNotificationSettings } from "./db";
import { encryptSecret } from "./secrets";
import { chatWithActiveProvider } from "./ai-providers";
import { sendUserNotifications } from "./notifications";
import { buildTomorrowBrief, sendTomorrowBriefForUser } from "./daily-brief";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function int(formData: FormData, key: string, fallback: number): number {
  const n = Number(text(formData, key));
  return Number.isFinite(n) ? n : fallback;
}

export async function registerAction(formData: FormData) {
  const email = text(formData, "email");
  const password = text(formData, "password");
  const name = text(formData, "name");
  createUser({ email, password, name });
  await signIn(email, password);
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  await signIn(text(formData, "email"), text(formData, "password"));
  redirect("/dashboard");
}

export async function logoutAction() {
  await signOut();
  redirect("/");
}

export async function saveNotificationSettingsAction(formData: FormData) {
  const user = await requireUser();
  const current = ensureNotificationSettings(user.id);
  const telegramToken = text(formData, "telegram_bot_token");
  const serverChanKey = text(formData, "serverchan_sendkey");
  getDb()
    .prepare(
      `UPDATE notification_settings
       SET telegram_enabled = ?,
           telegram_bot_token_enc = ?,
           telegram_chat_id = ?,
           serverchan_enabled = ?,
           serverchan_sendkey_enc = ?,
           daily_push_enabled = ?,
           push_hour = ?,
           push_timezone = ?,
           updated_at = datetime('now')
       WHERE user_id = ?`,
    )
    .run(
      formData.get("telegram_enabled") ? 1 : 0,
      telegramToken ? encryptSecret(telegramToken) : current.telegram_bot_token_enc,
      text(formData, "telegram_chat_id"),
      formData.get("serverchan_enabled") ? 1 : 0,
      serverChanKey ? encryptSecret(serverChanKey) : current.serverchan_sendkey_enc,
      formData.get("daily_push_enabled") ? 1 : 0,
      Math.max(0, Math.min(23, int(formData, "push_hour", 18))),
      text(formData, "push_timezone") || "Asia/Shanghai",
      user.id,
    );
  redirect("/settings?ok=notifications");
}

export async function testNotificationAction() {
  const user = await requireUser();
  await sendUserNotifications(
    user.id,
    "世界杯预测推送测试",
    "这是一条测试消息。如果你看到了它，Telegram / 方糖配置就已经可用了。",
  );
  redirect("/settings?ok=test");
}

export async function sendMyTomorrowBriefAction() {
  const user = await requireUser();
  await sendTomorrowBriefForUser(user.id);
  redirect("/dashboard?ok=brief");
}

export async function saveAiProviderAction(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 0);
  const apiKey = text(formData, "api_key");
  const current = id
    ? (getDb().prepare("SELECT api_key_enc FROM ai_providers WHERE id = ?").get(id) as { api_key_enc: string } | undefined)
    : undefined;
  const payload = {
    name: text(formData, "name") || "AI Provider",
    provider_type: text(formData, "provider_type") || "openai-compatible",
    base_url: text(formData, "base_url"),
    api_key_enc: apiKey ? encryptSecret(apiKey) : current?.api_key_enc ?? "",
    model: text(formData, "model"),
    enabled: formData.get("enabled") ? 1 : 0,
    is_default: formData.get("is_default") ? 1 : 0,
    config_json: text(formData, "config_json") || "{}",
  };
  const db = getDb();
  if (payload.is_default) db.prepare("UPDATE ai_providers SET is_default = 0").run();
  if (id) {
    db.prepare(
      `UPDATE ai_providers
       SET name = @name,
           provider_type = @provider_type,
           base_url = @base_url,
           api_key_enc = @api_key_enc,
           model = @model,
           enabled = @enabled,
           is_default = @is_default,
           config_json = @config_json,
           updated_at = datetime('now')
       WHERE id = @id`,
    ).run({ ...payload, id });
  } else {
    db.prepare(
      `INSERT INTO ai_providers (name, provider_type, base_url, api_key_enc, model, enabled, is_default, config_json)
       VALUES (@name, @provider_type, @base_url, @api_key_enc, @model, @enabled, @is_default, @config_json)`,
    ).run(payload);
  }
  redirect("/admin/ai?ok=saved");
}

export async function deleteAiProviderAction(formData: FormData) {
  await requireAdmin();
  getDb().prepare("DELETE FROM ai_providers WHERE id = ?").run(int(formData, "id", 0));
  redirect("/admin/ai?ok=deleted");
}

export async function testAiProviderAction() {
  await requireAdmin();
  await chatWithActiveProvider([
    { role: "system", content: "你是一个只输出一句话的足球分析助手。" },
    { role: "user", content: "用中文回复：AI 接口配置测试成功。" },
  ]);
  redirect("/admin/ai?ok=test");
}

export async function previewTomorrowBriefAction() {
  await requireUser();
  const brief = await buildTomorrowBrief({ timezone: "Asia/Shanghai", includeAi: false });
  return brief.body;
}
