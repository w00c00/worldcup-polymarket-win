"use server";

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { redirect } from "next/navigation";
import { AuthError, createUser, requireAdmin, requireUser, signIn, signOut } from "./auth";
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

function authErrorCode(error: unknown): string {
  if (error instanceof AuthError) return error.code;
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) return "email_exists";
  if (error instanceof Error && error.message.includes("密码至少")) return "weak_password";
  if (error instanceof Error && error.message.includes("有效邮箱")) return "invalid_email";
  return "unknown";
}

function aiTestErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/HTTP\s+(401|403)|unauthorized|forbidden/i.test(message)) return "auth";
  if (/API Key|尚未配置|未配置/i.test(message)) return "missing_key";
  if (/HTTP\s+429|rate limit/i.test(message)) return "rate_limit";
  if (/abort|timeout|timed out/i.test(message)) return "timeout";
  return "test_failed";
}

export async function registerAction(formData: FormData) {
  const email = text(formData, "email");
  const password = text(formData, "password");
  const name = text(formData, "name");
  let target = "/login?registered=pending";
  try {
    const user = createUser({ email, password, name });
    if (user.status === "approved") {
      await signIn(email, password);
      target = "/dashboard";
    }
  } catch (error) {
    target = `/register?error=${authErrorCode(error)}`;
  }
  redirect(target);
}

export async function loginAction(formData: FormData) {
  let target = "/dashboard";
  try {
    await signIn(text(formData, "email"), text(formData, "password"));
  } catch (error) {
    target = `/login?error=${authErrorCode(error)}`;
  }
  redirect(target);
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

export async function reviewRegistrationAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = int(formData, "user_id", 0);
  const decision = text(formData, "decision");
  const db = getDb();
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId) as { id: number; role: string } | undefined;
  if (!target) redirect("/admin/users?error=missing");
  if (decision === "reject" && (target.id === admin.id || target.role === "admin")) {
    redirect("/admin/users?error=admin_reject");
  }
  if (decision === "approve") {
    db.prepare("UPDATE users SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(userId);
    redirect("/admin/users?ok=approved");
  }
  if (decision === "reject") {
    db.prepare("UPDATE users SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    redirect("/admin/users?ok=rejected");
  }
  redirect("/admin/users?error=bad_decision");
}

export async function testAiProviderAction() {
  await requireAdmin();
  let target = "/admin/ai?ok=test";
  try {
    await chatWithActiveProvider(
      [
        { role: "system", content: "你是一个只输出一句话的足球分析助手。" },
        { role: "user", content: "用中文回复：AI 接口配置测试成功。" },
      ],
      { maxTokens: 80 },
    );
  } catch (error) {
    console.error("AI provider test failed:", error instanceof Error ? error.message : String(error));
    target = `/admin/ai?error=${aiTestErrorCode(error)}`;
  }
  redirect(target);
}

export async function previewTomorrowBriefAction() {
  await requireUser();
  const brief = await buildTomorrowBrief({ timezone: "Asia/Shanghai", includeAi: false });
  return brief.body;
}

export async function fetchPlayerPhotosAction(formData: FormData) {
  await requireAdmin();
  const limit = Math.max(20, Math.min(1255, int(formData, "limit", 160)));
  const delay = Math.max(200, Math.min(5000, int(formData, "delay", 900)));
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
  const jobDir = path.join(dataDir, "jobs");
  fs.mkdirSync(jobDir, { recursive: true });
  const pidFile = path.join(jobDir, "player-photo-fetch.pid");
  const logFile = path.join(jobDir, "player-photo-fetch.log");

  const existingPid = readPid(pidFile);
  if (existingPid && isProcessRunning(existingPid)) {
    redirect("/admin/maintenance?error=photos_running");
  }
  fs.rmSync(pidFile, { force: true });

  const command = [
    `cd ${shellQuote(process.cwd())}`,
    `echo "[$(date -Is)] start player photo fetch limit=${limit} delay=${delay}"`,
    `${shellQuote(process.execPath)} scripts/fetch-player-photos.mjs --limit=${limit} --delay=${delay} --retries=1 --timeout=8000`,
    "status=$?",
    `echo "[$(date -Is)] finished status=$status"`,
    `rm -f ${shellQuote(pidFile)}`,
    "exit $status",
  ].join("; ");
  const logFd = fs.openSync(logFile, "a");
  const child = spawn("/bin/sh", ["-lc", command], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  fs.writeFileSync(pidFile, String(child.pid));
  child.unref();
  redirect("/admin/maintenance?ok=photos_started");
}

function readPid(file: string): number | null {
  try {
    const pid = Number(fs.readFileSync(file, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
