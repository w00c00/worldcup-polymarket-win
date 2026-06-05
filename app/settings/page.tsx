import Link from "next/link";
import { saveNotificationSettingsAction, testNotificationAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { ensureNotificationSettings } from "@/lib/db";
import { maskSecret } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string }>;
}) {
  const user = await requireUser();
  const settings = ensureNotificationSettings(user.id);
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="zen-panel rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.26em] text-emerald-300">notification settings</div>
            <h1 className="mt-2 text-3xl font-black text-white">个人推送配置</h1>
            <p className="mt-2 text-sm text-slate-400">
              每个用户可以配置自己的 Telegram Bot、Telegram Chat ID 和方糖 Server 酱 SendKey。
            </p>
          </div>
          <Link href="/dashboard" className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-slate-300">
            返回控制台
          </Link>
        </div>
        {params?.ok && (
          <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            {params.ok === "test" ? "测试推送已发送，请检查通道。" : "配置已保存。"}
          </div>
        )}
      </section>

      <form action={saveNotificationSettingsAction} className="zen-panel rounded-xl p-5">
        <div className="grid gap-5 md:grid-cols-2">
          <section className="space-y-4">
            <h2 className="text-xl font-black text-white">Telegram</h2>
            <Check name="telegram_enabled" label="启用 Telegram 推送" checked={Boolean(settings.telegram_enabled)} />
            <Input label={`Bot Token${settings.telegram_bot_token_enc ? `（当前 ${maskSecret(settings.telegram_bot_token_enc)}）` : ""}`} name="telegram_bot_token" placeholder="留空则保持不变" />
            <Input label="Chat ID" name="telegram_chat_id" defaultValue={settings.telegram_chat_id} placeholder="例如 123456789 或 -100..." />
            <p className="text-xs leading-relaxed text-slate-500">
              Bot Token 从 BotFather 获取；Chat ID 可通过向机器人发消息后调用 getUpdates 查询。
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black text-white">方糖 / Server 酱</h2>
            <Check name="serverchan_enabled" label="启用方糖推送" checked={Boolean(settings.serverchan_enabled)} />
            <Input label={`SendKey${settings.serverchan_sendkey_enc ? `（当前 ${maskSecret(settings.serverchan_sendkey_enc)}）` : ""}`} name="serverchan_sendkey" placeholder="留空则保持不变" />
            <p className="text-xs leading-relaxed text-slate-500">
              兼容 Server 酱 Turbo：系统会向 sctapi.ftqq.com 的 send 接口发送 title 和 desp。
            </p>
          </section>
        </div>

        <section className="mt-6 border-t border-white/10 pt-5">
          <h2 className="text-xl font-black text-white">每日赛前推送</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Check name="daily_push_enabled" label="启用每日推送" checked={Boolean(settings.daily_push_enabled)} />
            <Input label="推送小时" name="push_hour" type="number" min="0" max="23" defaultValue={String(settings.push_hour)} />
            <Input label="时区" name="push_timezone" defaultValue={settings.push_timezone} placeholder="Asia/Shanghai" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            VPS 上建议每小时调用一次 cron API；系统会按用户时区和小时判断是否需要发送。
          </p>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <button className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-black text-ink-950 transition hover:brightness-110">
            保存配置
          </button>
        </div>
      </form>

      <form action={testNotificationAction} className="zen-panel rounded-xl p-5">
        <h2 className="text-xl font-black text-white">测试通道</h2>
        <p className="mt-1 text-sm text-slate-400">保存后可以发送一条测试消息，验证机器人和方糖配置。</p>
        <button className="mt-4 rounded-lg border border-emerald-400/30 px-3 py-2 text-sm font-black text-emerald-300 transition hover:bg-emerald-400/10">
          发送测试消息
        </button>
      </form>
    </div>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-slate-300">
      <input name={name} type="checkbox" defaultChecked={checked} className="h-4 w-4 accent-emerald-300" />
      {label}
    </label>
  );
}

function Input({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-300">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        max={max}
        className="mt-1 w-full rounded-lg border border-white/10 bg-[#07121b] px-3 py-2.5 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300/60"
      />
    </label>
  );
}
