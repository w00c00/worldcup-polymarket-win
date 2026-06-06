import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type Role, type User, type UserStatus } from "./db";

const COOKIE = "wc_session";
const SESSION_DAYS = 30;

type DbUser = User & {
  password_salt: string;
  password_hash: string;
};

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_credentials" | "pending_approval" | "rejected",
  ) {
    super(message);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("base64url")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("base64url");
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, expected: string): boolean {
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (actual.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actual, expectedBuffer);
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

function expiresAt(): string {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function userCount(): number {
  return (getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
}

export function createUser(input: { email: string; password: string; name?: string }): User {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new Error("请输入有效邮箱");
  if (input.password.length < 8) throw new Error("密码至少 8 位");
  const db = getDb();
  const isFirstUser = userCount() === 0;
  const role: Role = isFirstUser ? "admin" : "user";
  const status: UserStatus = isFirstUser ? "approved" : "pending";
  const { salt, hash } = hashPassword(input.password);
  const result = db
    .prepare(
      `INSERT INTO users (email, name, role, status, password_salt, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(email, input.name?.trim() || email.split("@")[0], role, status, salt, hash);
  db.prepare("INSERT INTO notification_settings (user_id) VALUES (?)").run(result.lastInsertRowid);
  return db
    .prepare("SELECT id, email, name, role, status, created_at, updated_at FROM users WHERE id = ?")
    .get(result.lastInsertRowid) as User;
}

export async function signIn(email: string, password: string): Promise<User> {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) as DbUser | undefined;
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    throw new AuthError("邮箱或密码不正确", "invalid_credentials");
  }
  if (user.status === "pending") {
    throw new AuthError("账号正在等待管理员审核", "pending_approval");
  }
  if (user.status === "rejected") {
    throw new AuthError("账号审核未通过", "rejected");
  }
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(
    user.id,
    tokenHash(token),
    expiresAt(),
  );
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at, u.updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'approved'
       LIMIT 1`,
    )
    .get(tokenHash(token), new Date().toISOString()) as User | undefined;
  return row ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  jar.delete(COOKIE);
}
