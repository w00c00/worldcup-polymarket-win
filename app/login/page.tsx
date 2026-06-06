import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorText: Record<string, string> = {
  invalid_credentials: "邮箱或密码不正确。",
  pending_approval: "账号正在等待管理员审核，通过后才能登录。",
  rejected: "账号审核未通过，请联系管理员。",
  unknown: "登录失败，请稍后再试。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; registered?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const params = await searchParams;

  return (
    <main className="mx-auto max-w-md py-10">
      <section className="zen-panel rounded-2xl p-6">
        <div className="mono text-[11px] uppercase tracking-[0.26em] text-emerald-300">private dashboard</div>
        <h1 className="mt-2 text-3xl font-black text-white">登录后台</h1>
        <p className="mt-2 text-sm text-slate-400">配置 AI 接口、个人推送和每日赛程预测。</p>
        {params?.registered === "pending" && (
          <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            注册已提交，等待管理员审核。审核通过后即可登录。
          </div>
        )}
        {params?.error && (
          <div className="mt-4 rounded-lg border border-orange-400/25 bg-orange-400/10 px-3 py-2 text-sm text-orange-200">
            {errorText[params.error] ?? errorText.unknown}
          </div>
        )}
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
