import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Ticker } from "@/components/Ticker";
import { getWorldCupMarkets } from "@/lib/polymarket";
import { championProbabilities } from "@/lib/model";
import { TEAMS } from "@/lib/worldcup";

export const metadata: Metadata = {
  title: "World Cup Console · AI 世界杯预测市场",
  description:
    "扫描 Polymarket 世界杯预测盘口，以 AI Provider、推送后台和胜率模型发现市场分歧。",
};

export const revalidate = 120;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Live odds ticker fed by real Polymarket data (fail-soft to model odds).
  let items: { label: string; value: string; up?: boolean }[] = [];
  try {
    const markets = await getWorldCupMarkets();
    const winner = markets.find((m) => m.slug?.includes("winner")) ?? markets[0];
    if (winner) {
      items = winner.outcomes.slice(0, 14).map((o) => ({
        label: o.label,
        value: (o.price * 100).toFixed(1) + "%",
      }));
    }
  } catch {
    items = championProbabilities()
      .slice(0, 12)
      .map((c) => ({ label: c.team.name, value: (c.prob * 100).toFixed(1) + "%" }));
  }
  const codeByName = new Map(TEAMS.map((t) => [t.name, t.code]));
  const tickerItems = items.map((i) => ({ ...i, code: codeByName.get(i.label) }));

  return (
    <html lang="zh">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ ["--font-sans" as string]: "'Inter', system-ui, sans-serif" }}>
        <div className="content-layer">
          <Nav />
          <Ticker items={tickerItems} />
          <main className="mx-auto max-w-7xl px-4 pb-24 pt-6">{children}</main>
          <footer className="mx-auto max-w-7xl px-4 pb-10">
            <div className="overflow-hidden rounded-2xl border border-emerald-400/20 bg-[#07121b]/86 shadow-[0_18px_70px_rgba(0,0,0,0.36)]">
              <div className="relative px-6 py-7 md:flex md:items-center md:justify-between md:gap-8 md:px-8">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,rgba(39,245,138,0.16),transparent_38%),radial-gradient(circle_at_88%_45%,rgba(34,211,238,0.12),transparent_34%)]" />
                <div className="relative">
                  <div className="text-[10px] font-black uppercase tracking-[0.32em] text-emerald-300">
                    prediction console
                  </div>
                  <div className="mt-2 text-2xl font-black text-white md:text-3xl">
                    世界杯预测市场后台
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                    支持用户独立配置 Telegram 与方糖推送，管理员可维护 MiniMax、MiMo 和 OpenAI-compatible AI 接口。
                  </p>
                </div>

                <div className="relative mt-5 flex flex-col gap-2 md:mt-0 md:items-end">
                  <a href="/dashboard" className="inline-flex items-center justify-center rounded-xl border border-emerald-300/35 bg-emerald-300 px-5 py-3 text-sm font-black text-ink-950 shadow-[0_0_34px_rgba(39,245,138,0.28)] transition hover:brightness-110">
                    打开控制台
                  </a>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400">
                    /dashboard · /settings · /admin/ai
                  </div>
                </div>
              </div>
              <div className="border-t border-white/10 px-6 py-3 text-center text-[11px] text-slate-500 md:px-8">
                盘口数据来自 Polymarket 公开 API（实时）· AI 分析由 MiniMax 生成。仅供信息参考，非投资建议。
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
