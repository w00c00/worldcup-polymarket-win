import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let singleton: Database.Database | null = null;

export type Role = "admin" | "user";
export type UserStatus = "pending" | "approved" | "rejected";

export type User = {
  id: number;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

export type NotificationSettings = {
  user_id: number;
  telegram_enabled: number;
  telegram_bot_token_enc: string;
  telegram_chat_id: string;
  serverchan_enabled: number;
  serverchan_sendkey_enc: string;
  daily_push_enabled: number;
  push_hour: number;
  push_timezone: string;
  created_at: string;
  updated_at: string;
};

export type AiProvider = {
  id: number;
  name: string;
  provider_type: "minimax-cn" | "xiaomi-mimo" | "openai-compatible";
  base_url: string;
  api_key_enc: string;
  model: string;
  enabled: number;
  is_default: number;
  config_json: string;
  created_at: string;
  updated_at: string;
};

export type PushLog = {
  id: number;
  user_id: number;
  channel: string;
  title: string;
  status: "sent" | "failed" | "skipped";
  error: string;
  created_at: string;
};

export function getDb(): Database.Database {
  if (singleton) return singleton;
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  singleton = new Database(path.join(dataDir, "worldcup.sqlite"));
  singleton.pragma("journal_mode = WAL");
  singleton.pragma("foreign_keys = ON");
  migrate(singleton);
  seedAiProviders(singleton);
  return singleton;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'pending',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      telegram_enabled INTEGER NOT NULL DEFAULT 0,
      telegram_bot_token_enc TEXT NOT NULL DEFAULT '',
      telegram_chat_id TEXT NOT NULL DEFAULT '',
      serverchan_enabled INTEGER NOT NULL DEFAULT 0,
      serverchan_sendkey_enc TEXT NOT NULL DEFAULT '',
      daily_push_enabled INTEGER NOT NULL DEFAULT 1,
      push_hour INTEGER NOT NULL DEFAULT 18,
      push_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_enc TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS push_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_push_logs_user_created ON push_logs(user_id, created_at DESC);
  `);

  const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "status")) {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  }
  db.exec(`
    UPDATE users
    SET status = 'approved'
    WHERE status IS NULL OR status = '';

    CREATE INDEX IF NOT EXISTS idx_users_status_created ON users(status, created_at DESC);
  `);
}

function seedAiProviders(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) AS c FROM ai_providers").get() as { c: number };
  if (count.c > 0) return;
  const insert = db.prepare(`
    INSERT INTO ai_providers (name, provider_type, base_url, model, enabled, is_default, config_json)
    VALUES (@name, @provider_type, @base_url, @model, @enabled, @is_default, @config_json)
  `);
  insert.run({
    name: "MiniMax 国内版",
    provider_type: "minimax-cn",
    base_url: process.env.MINIMAX_BASE_URL || "https://api.minimax.chat",
    model: process.env.MINIMAX_MODEL || "MiniMax-Text-01",
    enabled: 0,
    is_default: 1,
    config_json: "{}",
  });
  insert.run({
    name: "小米 MiMo",
    provider_type: "xiaomi-mimo",
    base_url: process.env.XIAOMI_MIMO_BASE_URL || "https://api.mimo.xiaomi.com/v1",
    model: process.env.XIAOMI_MIMO_MODEL || "mimo-v2.5-pro",
    enabled: 0,
    is_default: 0,
    config_json: "{\"protocol\":\"openai-compatible\"}",
  });
  insert.run({
    name: "OpenAI 兼容接口",
    provider_type: "openai-compatible",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    enabled: 0,
    is_default: 0,
    config_json: "{}",
  });
}

export function ensureNotificationSettings(userId: number): NotificationSettings {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO notification_settings (user_id) VALUES (?)").run(userId);
  return db
    .prepare("SELECT * FROM notification_settings WHERE user_id = ?")
    .get(userId) as NotificationSettings;
}
