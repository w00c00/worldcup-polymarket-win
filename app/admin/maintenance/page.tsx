import Link from "next/link";
import { fetchPlayerPhotosAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { PLAYERS } from "@/lib/players";
import { playerPhotoCacheStats, playerPhotoJobStatus } from "@/lib/player-photo-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const okText: Record<string, string> = {
  photos_started: "头像抓取任务已启动，稍后刷新本页查看进度。",
};

const errorText: Record<string, string> = {
  photos_running: "已有头像抓取任务正在运行，请稍后再试。",
};

export default async function AdminMaintenancePage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const stats = playerPhotoCacheStats(PLAYERS.length);
  const job = playerPhotoJobStatus();
  const nextLimit = Math.min(PLAYERS.length, Math.max(160, stats.cachedPlayers + 80));

  return (
    <div className="space-y-6">
      <section className="zen-panel rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.26em] text-emerald-300">admin maintenance</div>
            <h1 className="mt-2 text-3xl font-black text-white">运维管理</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              分批缓存球员真实头像。已缓存的头像会跳过，抓到新图片后写入静态目录，动态页面刷新即可使用。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-slate-300">
              用户审核
            </Link>
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

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="zen-panel rounded-xl p-5">
          <h2 className="text-xl font-black text-white">球员头像缓存</h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label="已缓存" value={String(stats.cachedPlayers)} />
            <Metric label="球员池" value={String(stats.totalPlayers)} />
            <Metric label="覆盖率" value={`${(stats.coverage * 100).toFixed(1)}%`} />
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-400">
            静态图片文件：{stats.files} 个 · 状态：{job.running ? `运行中 #${job.pid}` : "空闲"}
          </div>

          <form action={fetchPlayerPhotosAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-sm">
              <span className="font-semibold text-slate-300">扫描前 N 名球员</span>
              <input
                name="limit"
                type="number"
                min="20"
                max={PLAYERS.length}
                defaultValue={String(nextLimit)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#07121b] px-3 py-2.5 text-white outline-none transition focus:border-emerald-300/60"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-slate-300">请求间隔 ms</span>
              <input
                name="delay"
                type="number"
                min="200"
                max="5000"
                defaultValue="900"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#07121b] px-3 py-2.5 text-white outline-none transition focus:border-emerald-300/60"
              />
            </label>
            <button
              disabled={job.running}
              className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-black text-ink-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              继续获取头像
            </button>
          </form>
        </div>

        <div className="zen-panel rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between border-b border-emerald-400/15 pb-3">
            <h2 className="text-xl font-black text-white">最近抓取日志</h2>
            <span className={job.running ? "text-xs font-bold text-emerald-300" : "text-xs text-slate-500"}>
              {job.running ? "running" : "idle"}
            </span>
          </div>
          {job.log.length ? (
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-[#05080f] p-3 text-xs leading-relaxed text-slate-300">
              {job.log.join("\n")}
            </pre>
          ) : (
            <p className="text-sm text-slate-500">暂无抓取日志。</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-white">{value}</div>
    </div>
  );
}
