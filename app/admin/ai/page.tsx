import Link from "next/link";
import { deleteAiProviderAction, saveAiProviderAction, testAiProviderAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { listAiProviders } from "@/lib/ai-providers";
import { maskSecret } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminAiPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string }>;
}) {
  await requireAdmin();
  const providers = listAiProviders();
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <section className="zen-panel rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.26em] text-emerald-300">admin ai providers</div>
            <h1 className="mt-2 text-3xl font-black text-white">AI 接口后台</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              MiniMax 国内版使用原生 chatcompletion_v2；小米 MiMo 和其他模型平台按 OpenAI-compatible 协议适配。默认启用且带 API Key 的 Provider 会被比赛分析和每日推送使用。
            </p>
          </div>
          <Link href="/dashboard" className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-slate-300">
            返回控制台
          </Link>
        </div>
        {params?.ok && (
          <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            {params.ok === "test" ? "AI 接口测试已通过。" : "AI 配置已更新。"}
          </div>
        )}
        <form action={testAiProviderAction} className="mt-4">
          <button className="rounded-lg border border-emerald-400/30 px-3 py-2 text-sm font-black text-emerald-300 transition hover:bg-emerald-400/10">
            测试当前默认 AI
          </button>
        </form>
      </section>

      <div className="grid gap-4">
        {providers.map((provider) => (
          <section key={provider.id} className="zen-panel rounded-xl p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-emerald-400/15 pb-3">
              <div>
                <h2 className="text-xl font-black text-white">{provider.name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  #{provider.id} · {provider.provider_type} · {provider.enabled ? "enabled" : "disabled"} · {provider.is_default ? "default" : "standby"}
                </p>
              </div>
              <form action={deleteAiProviderAction}>
                <input type="hidden" name="id" value={provider.id} />
                <button className="rounded-lg border border-orange-400/30 px-3 py-2 text-xs font-black text-orange-300 transition hover:bg-orange-400/10">
                  删除
                </button>
              </form>
            </div>
            <ProviderForm provider={provider} />
          </section>
        ))}
      </div>

      <section className="zen-panel rounded-xl p-5">
        <h2 className="text-xl font-black text-white">新增 Provider</h2>
        <p className="mt-1 text-sm text-slate-400">用于接入其他 OpenAI-compatible 国内模型网关，比如通义、Moonshot、DeepSeek、自建 New API 等。</p>
        <div className="mt-4">
          <ProviderForm />
        </div>
      </section>
    </div>
  );
}

function ProviderForm({
  provider,
}: {
  provider?: {
    id: number;
    name: string;
    provider_type: string;
    base_url: string;
    api_key_enc: string;
    model: string;
    enabled: number;
    is_default: number;
    config_json: string;
  };
}) {
  return (
    <form action={saveAiProviderAction} className="grid gap-4 md:grid-cols-2">
      {provider && <input type="hidden" name="id" value={provider.id} />}
      <Input label="名称" name="name" defaultValue={provider?.name ?? ""} placeholder="例如 MiniMax 国内版" required />
      <label className="block text-sm">
        <span className="font-semibold text-slate-300">Provider 类型</span>
        <select
          name="provider_type"
          defaultValue={provider?.provider_type ?? "openai-compatible"}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#07121b] px-3 py-2.5 text-white outline-none transition focus:border-emerald-300/60"
        >
          <option value="minimax-cn">MiniMax 国内版</option>
          <option value="xiaomi-mimo">小米 MiMo</option>
          <option value="openai-compatible">OpenAI 兼容</option>
        </select>
      </label>
      <Input label="Base URL" name="base_url" defaultValue={provider?.base_url ?? ""} placeholder="https://api.example.com/v1" required />
      <Input label="模型" name="model" defaultValue={provider?.model ?? ""} placeholder="MiniMax-Text-01 / mimo-v2.5-pro" required />
      <Input
        label={`API Key${provider?.api_key_enc ? `（当前 ${maskSecret(provider.api_key_enc)}）` : ""}`}
        name="api_key"
        placeholder="留空则保持不变"
      />
      <label className="block text-sm md:col-span-2">
        <span className="font-semibold text-slate-300">额外 JSON 配置</span>
        <textarea
          name="config_json"
          defaultValue={provider?.config_json ?? "{}"}
          rows={4}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#07121b] px-3 py-2.5 font-mono text-xs text-white outline-none transition focus:border-emerald-300/60"
        />
      </label>
      <div className="flex flex-wrap gap-3 md:col-span-2">
        <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-slate-300">
          <input name="enabled" type="checkbox" defaultChecked={Boolean(provider?.enabled)} className="h-4 w-4 accent-emerald-300" />
          启用
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-slate-300">
          <input name="is_default" type="checkbox" defaultChecked={Boolean(provider?.is_default)} className="h-4 w-4 accent-emerald-300" />
          设为默认
        </label>
        <button className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-black text-ink-950 transition hover:brightness-110">
          保存
        </button>
      </div>
    </form>
  );
}

function Input({
  label,
  name,
  defaultValue,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-300">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="mt-1 w-full rounded-lg border border-white/10 bg-[#07121b] px-3 py-2.5 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300/60"
      />
    </label>
  );
}
