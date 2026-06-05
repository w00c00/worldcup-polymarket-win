import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, userCount } from "@/lib/auth";
import { registerAction } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const firstUser = userCount() === 0;

  return (
    <main className="mx-auto max-w-md py-10">
      <section className="zen-panel rounded-2xl p-6">
        <div className="mono text-[11px] uppercase tracking-[0.26em] text-emerald-300">account setup</div>
        <h1 className="mt-2 text-3xl font-black text-white">注册账号</h1>
        <p className="mt-2 text-sm text-slate-400">
          {firstUser ? "第一个注册账号会自动成为管理员，可配置全站 AI Provider。" : "注册后可以配置自己的 Telegram 和方糖推送。"}
        </p>
        <form action={registerAction} className="mt-6 space-y-4">
          <Field label="昵称" name="name" autoComplete="name" />
          <Field label="邮箱" name="email" type="email" autoComplete="email" required />
          <Field label="密码" name="password" type="password" autoComplete="new-password" required />
          <button className="w-full rounded-lg bg-emerald-300 px-4 py-3 text-sm font-black text-ink-950 transition hover:brightness-110">
            创建账号
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          已有账号？ <Link href="/login" className="font-bold text-emerald-300">登录</Link>
        </p>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-300">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="mt-1 w-full rounded-lg border border-white/10 bg-[#07121b] px-3 py-2.5 text-white outline-none transition focus:border-emerald-300/60"
      />
    </label>
  );
}
