import "server-only";
import { getDb, type User } from "./db";
import { sendUserNotifications } from "./notifications";

type AdminUser = Pick<User, "id" | "email" | "name">;

export async function notifyAdminsOfNewRegistration(user: User): Promise<void> {
  const admins = getDb()
    .prepare(
      `SELECT id, email, name
       FROM users
       WHERE role = 'admin' AND status = 'approved'
       ORDER BY id ASC`,
    )
    .all() as AdminUser[];

  if (!admins.length) return;

  const userLabel = user.name && user.name !== user.email ? `${user.name}（${user.email}）` : user.email;
  const title = "新用户注册待审核";
  const body = [
    `用户：${userLabel}`,
    `注册时间：${formatShanghaiTime(user.created_at)}`,
    "状态：待管理员审核",
    "审核入口：/admin/users",
  ].join("\n");

  const results = await Promise.allSettled(admins.map((admin) => sendUserNotifications(admin.id, title, body)));
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to notify admin about registration:", result.reason);
    }
  }
}

function formatShanghaiTime(value: string): string {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
