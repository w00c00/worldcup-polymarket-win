import Link from "next/link";
import { reviewRegistrationAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { getDb, type Role, type UserStatus } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

const statusText: Record<UserStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
};

const okText: Record<string, string> = {
  approved: "用户已通过审核。",
  rejected: "用户已拒绝，并已清理其登录会话。",
};

const errorText: Record<string, string> = {
  missing: "用户不存在。",
  admin_reject: "不能拒绝管理员账号。",
  bad_decision: "无效的审核操作。",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const users = getDb()
    .prepare(
      `SELECT id, email, name, role, status, created_at, updated_at
       FROM users
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
         id DESC`,
    )
    .all() as AdminUser[];
  const pendingCount = users.filter((user) => user.status === "pending").length;

  return (
    <div className="space-y-6">
      <section className="zen-panel rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.26em] text-emerald-300">admin users</div>
            <h1 className="mt-2 text-3xl font-black text-white">注册审核</h1>
            <p className="mt-2 text-sm text-slate-400">
              当前有 {pendingCount} 个待审核账号。通过后用户才能登录控制台和配置个人推送。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/ai" className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-slate-300">
              AI 后台
            </Link>
            <Link href="/dashboard" className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-slate-300">
              返回控制台
            </Link>
          </div>
        </div>
        {params?.ok && (
          <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            {okText[params.ok] ?? "操作已完成。"}
          </div>
        )}
        {params?.error && (
          <div className="mt-4 rounded-lg border border-orange-400/25 bg-orange-400/10 px-3 py-2 text-sm text-orange-200">
            {errorText[params.error] ?? "操作失败。"}
          </div>
        )}
      </section>

      <section className="zen-panel rounded-xl p-4">
        <div className="divide-y divide-white/5">
          {users.map((user) => (
            <div key={user.id} className="grid gap-3 py-4 md:grid-cols-[1fr_8rem_8rem_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-black text-white">{user.name || user.email}</h2>
                  {user.id === admin.id && (
                    <span className="rounded border border-emerald-400/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      当前账号
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  #{user.id} · {user.email} · 注册于 {user.created_at}
                </p>
              </div>
              <span className="text-sm font-bold text-slate-300">{user.role === "admin" ? "管理员" : "普通用户"}</span>
              <span className={`text-sm font-bold ${statusClass(user.status)}`}>{statusText[user.status]}</span>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {user.status !== "approved" && (
                  <ReviewButton userId={user.id} decision="approve" label="通过" tone="approve" />
                )}
                {user.status !== "rejected" && user.role !== "admin" && (
                  <ReviewButton userId={user.id} decision="reject" label="拒绝" tone="reject" />
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function statusClass(status: UserStatus): string {
  if (status === "approved") return "text-emerald-300";
  if (status === "pending") return "text-yellow-200";
  return "text-orange-300";
}

function ReviewButton({
  userId,
  decision,
  label,
  tone,
}: {
  userId: number;
  decision: "approve" | "reject";
  label: string;
  tone: "approve" | "reject";
}) {
  return (
    <form action={reviewRegistrationAction}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="decision" value={decision} />
      <button
        className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
          tone === "approve"
            ? "border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10"
            : "border-orange-400/30 text-orange-300 hover:bg-orange-400/10"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
