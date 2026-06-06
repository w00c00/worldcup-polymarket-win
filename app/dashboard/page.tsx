import Link from "next/link";
import { logoutAction, sendMyTomorrowBriefAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { ensureNotificationSettings, getDb, type PushLog } from "@/lib/db";
import { formatBeijingDateTime } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const settings = ensureNotificationSettings(user.id);
  const logs = getDb()
    .prepare("SELECT id, user_id, channel, title, status, error, created_at FROM push_logs WHERE user_id = ? ORDER BY id DESC LIMIT 8")
    .all(user.id) as PushLog[];

  return (
    <div className="space-y-6">
      <section className="zen-panel rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.26em] text-emerald-300">dashboard</div>
            <h1 className="mt-2 text-3xl font-black text-white">控制台</h1>
            <p className="mt-2 text-sm text-slate-400">
              {user.name} · {user.email} · {user.role === "admin" ? "管理员" : "普通用户"}
            </p>
          </div>
          <form action={logoutAction}>
            <button className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/5">
              退出登录
            </button>
          </form>
        </div>
        {params?.ok === "brief" && (
          <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            已触发一次明日赛程预测推送。
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="个人推送" subtitle="Telegram / 方糖 / 每日推送时间">
          <div className="space-y-2 text-sm text-slate-300">
            <Status label="Telegram" enabled={Boolean(settings.telegram_enabled)} />
            <Status label="方糖 Server 酱" enabled={Boolean(settings.serverchan_enabled)} />
            <Status label="每日赛前推送" enabled={Boolean(settings.daily_push_enabled)} />
            <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-400">
              {settings.push_timezone} · {String(settings.push_hour).padStart(2, "0")}:00
            </div>
          </div>
          <Link href="/settings" className="mt-4 inline-flex rounded-lg bg-emerald-300 px-3 py-2 text-sm font-black text-ink-950">
            配置推送
          </Link>
        </Panel>

        <Panel title="明日简报" subtitle="立即生成并推送到你的通道">
          <p className="text-sm leading-relaxed text-slate-400">
            用当前模型生成明天比赛的胜平负、赔率、比分和市场代理说明。VPS 上可用 cron 定时调用同一逻辑。
          </p>
          <form action={sendMyTomorrowBriefAction} className="mt-4">
            <button className="rounded-lg border border-emerald-400/30 px-3 py-2 text-sm font-black text-emerald-300 transition hover:bg-emerald-400/10">
              发送我的明日预测
            </button>
          </form>
        </Panel>

        <Panel title="AI Provider" subtitle="管理员配置全站 AI 接口">
          {user.role === "admin" ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/users" className="inline-flex rounded-lg bg-emerald-300 px-3 py-2 text-sm font-black text-ink-950">
                用户审核
              </Link>
              <Link href="/admin/maintenance" className="inline-flex rounded-lg border border-cyan-300/30 px-3 py-2 text-sm font-black text-cyan-200">
                运维管理
              </Link>
              <Link href="/admin/ai" className="inline-flex rounded-lg border border-emerald-400/30 px-3 py-2 text-sm font-black text-emerald-300">
                AI 后台
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-400">当前账号不是管理员，AI 接口由管理员统一维护。</p>
          )}
        </Panel>
      </div>

      <section className="zen-panel rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between border-b border-emerald-400/15 pb-3">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.24em] text-emerald-300">push logs</div>
            <h2 className="mt-1 text-xl font-black text-white">最近推送记录</h2>
          </div>
        </div>
        {logs.length ? (
          <div className="divide-y divide-white/5">
            {logs.map((log) => (
              <div key={log.id} className="grid gap-2 py-3 text-sm md:grid-cols-[9rem_7rem_1fr]">
                <span className="mono text-xs text-slate-500">{formatBeijingDateTime(log.created_at)}</span>
                <span className={log.status === "sent" ? "text-emerald-300" : log.status === "failed" ? "text-orange-300" : "text-slate-400"}>
                  {log.channel} · {log.status}
                </span>
                <span className="text-slate-300">{log.title}{log.error ? ` · ${log.error}` : ""}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">还没有推送记录。</p>
        )}
      </section>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="zen-panel rounded-xl p-4">
      <div className="mb-4 border-b border-emerald-400/15 pb-3">
        <h2 className="text-lg font-black text-white">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Status({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
      <span>{label}</span>
      <span className={enabled ? "font-bold text-emerald-300" : "text-slate-500"}>{enabled ? "已启用" : "未启用"}</span>
    </div>
  );
}
