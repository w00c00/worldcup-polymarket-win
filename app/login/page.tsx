import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-md py-10">
      <section className="zen-panel rounded-2xl p-6">
        <div className="mono text-[11px] uppercase tracking-[0.26em] text-emerald-300">private dashboard</div>
        <h1 className="mt-2 text-3xl font-black text-white">登录后台</h1>
        <p className="mt-2 text-sm text-slate-400">配置 AI 接口、个人推送和每日赛程预测。</p>
        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="font-semibold text-slate-300">邮箱</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#07121b] px-3 py-2.5 text-white outline-none transition focus:border-emerald-300/60"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-300">密码</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#07121b] px-3 py-2.5 text-white outline-none transition focus:border-emerald-300/60"
            />
          </label>
          <button className="w-full rounded-lg bg-emerald-300 px-4 py-3 text-sm font-black text-ink-950 transition hover:brightness-110">
            登录
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          还没有账号？ <Link href="/register" className="font-bold text-emerald-300">注册</Link>
        </p>
      </section>
    </main>
  );
}
