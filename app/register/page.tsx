import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, userCount } from "@/lib/auth";
import { registerAction } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorText: Record<string, string> = {
  email_exists: "这个邮箱已经注册过，请直接登录或换一个邮箱。",
  weak_password: "密码至少需要 8 位。",
  invalid_email: "请输入有效邮箱。",
  unknown: "注册失败，请稍后再试。",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const firstUser = userCount() === 0;
  const params = await searchParams;

  return (
    <main className="mx-auto max-w-md py-10">
      <section className="zen-panel rounded-2xl p-6">
        <div className="mono text-[11px] uppercase tracking-[0.26em] text-emerald-300">account setup</div>
        <h1 className="mt-2 text-3xl font-black text-white">注册账号</h1>
        <p className="mt-2 text-sm text-slate-400">
          {firstUser ? "第一个注册账号会自动成为管理员，可配置全站 AI Provider。" : "注册后需要管理员审核，通过后才能登录控制台。"}
        </p>
        {params?.error && (
          <div className="mt-4 rounded-lg border border-orange-400/25 bg-orange-400/10 px-3 py-2 text-sm text-orange-200">
            {errorText[params.error] ?? errorText.unknown}
          </div>
        )}
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
