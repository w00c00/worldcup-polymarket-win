import { getWorldCupMarkets, divergenceSignals } from "@/lib/polymarket";
import { MarketCard } from "@/components/MarketCard";
import { SectionTitle, Flag } from "@/components/ui";
import { modelChampionFor, championProbabilities } from "@/lib/model";
import { MATCHES, TEAMS } from "@/lib/worldcup";
import { safeChampion } from "@/lib/ai";
import { ScannerConsole } from "@/components/ScannerConsole";
import { formatSignedPct, recommendYesNo } from "@/lib/trade-recommendation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const markets = await getWorldCupMarkets();
  const winner = markets.find((m) => m.slug?.includes("winner")) ?? markets[0];

  // Value radar: model champion prob vs Polymarket implied prob.
  const nameToCode = new Map(TEAMS.map((t) => [t.name, t.code]));
  const signals = winner
    ? divergenceSignals(winner, (name) => {
        const code = nameToCode.get(name);
        return code ? modelChampionFor(code) : 0;
      }).slice(0, 6)
    : [];

  const totalVol = markets.reduce((s, m) => s + m.volume, 0);
  const openingMatch = [...MATCHES].sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
  const codeToTeam = new Map(TEAMS.map((t) => [t.code, t]));
  const openingHome = openingMatch.home ? codeToTeam.get(openingMatch.home)?.zh : openingMatch.homeLabel;
  const openingAway = openingMatch.away ? codeToTeam.get(openingMatch.away)?.zh : openingMatch.awayLabel;

  // AI (MiniMax) independent champion pricing vs Polymarket implied prob.
  const aiChamp = await safeChampion();
  const marketByCode = new Map<string, number>();
  if (winner)
    for (const o of winner.outcomes) {
      const code = nameToCode.get(o.label);
      if (code) marketByCode.set(code, o.price);
    }
  const aiRows = aiChamp
    .filter((a) => marketByCode.has(a.code))
    .map((a) => ({ ...a, market: marketByCode.get(a.code)!, edge: a.prob - marketByCode.get(a.code)! }))
    .sort((x, y) => Math.abs(y.edge) - Math.abs(x.edge))
    .slice(0, 6);

  return (
    <div className="space-y-12">
      <ScannerConsole
        marketsCount={markets.length}
        totalVolume={totalVol}
        teamsCount={TEAMS.length}
        topSignals={signals}
        kickoff={openingMatch.kickoff}
        openingMatch={`${openingHome ?? "揭幕战"} vs ${openingAway ?? "待定"}`}
        openingVenue={`${openingMatch.city} · ${openingMatch.venue}`}
      />

      {/* ---------- WINNER MARKET FOCUS ---------- */}
      {winner && (
        <section id="winner-market">
          <SectionTitle sub="AI 概率高于市场价：偏向买 YES；AI 概率低于市场价：偏向买 NO；差值小于 2pt 则观望">
            <span className="zen-text">总盘口分析</span> · World Cup Winner
          </SectionTitle>
          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.45fr]">
            <div className="card p-5">
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Polymarket Event</div>
              <h2 className="mt-2 text-2xl font-black text-white">{winner.title || "World Cup Winner"}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                这里作为全站主盘口：用实时隐含概率、成交量、流动性和 AI 独立概率做差，输出冠军盘错价信号。
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MiniStat label="选项数" value={String(winner.outcomes.length)} />
                <MiniStat label="事件热度" value={`${winner.heat.toFixed(1)}`} />
                <MiniStat label="总成交" value={`$${abbr(winner.volume)}`} />
                <MiniStat label="流动性" value={`$${abbr(winner.liquidity)}`} />
              </div>
              <Link
                href="https://polymarket.com/zh/event/world-cup-winner/will-france-win-the-2026-fifa-world-cup-924"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex rounded-lg border border-emerald-400/30 px-3 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/10"
              >
                打开 Polymarket 总冠军盘口
              </Link>
            </div>

            <div className="card overflow-hidden">
              <div className="grid grid-cols-[1.1fr_0.62fr_0.62fr_0.78fr_0.78fr] gap-2 border-b border-white/10 px-4 py-2.5 text-xs uppercase tracking-wide text-slate-400">
                <span>球队</span>
                <span className="text-right">隐含概率</span>
                <span className="text-right">AI胜率</span>
                <span className="text-right">建议</span>
                <span className="text-right">Edge</span>
              </div>
              {winner.outcomes.slice(0, 10).map((o) => {
                const code = nameToCode.get(o.label);
                const model = code ? modelChampionFor(code) : 0;
                const rec = model > 0 ? recommendYesNo(model, o.price) : undefined;
                return (
                  <Link
                    key={o.label}
                    href={o.url ?? winner.url}
                    target="_blank"
                    rel="noreferrer"
                    className="grid grid-cols-[1.1fr_0.62fr_0.62fr_0.78fr_0.78fr] items-center gap-2 border-b border-white/5 px-4 py-2.5 text-sm transition hover:bg-white/5 last:border-0"
                  >
                    <span className="flex items-center gap-2 font-medium text-white">
                      {code && <Flag code={code} className="h-4 w-6" />}
                      {o.label}
                    </span>
                    <span className="text-right font-bold tabular-nums text-emerald-300">
                      {(o.price * 100).toFixed(2)}%
                    </span>
                    <span className="text-right tabular-nums text-slate-300">{model > 0 ? `${(model * 100).toFixed(1)}%` : "--"}</span>
                    <span className="text-right">{rec ? <TradeBadge label={rec.label} tone={rec.tone} /> : "--"}</span>
                    <span className={`text-right tabular-nums ${rec?.tone === "yes" ? "text-emerald-300" : rec?.tone === "no" ? "text-orange-300" : "text-slate-400"}`}>
                      {rec ? formatSignedPct(rec.edge) : "--"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ---------- AI PRICING vs MARKET ---------- */}
      {aiRows.length > 0 ? (
        <section id="ai">
          <SectionTitle sub="MiniMax 独立给出夺冠概率（对市场盲测），再与 Polymarket 实时隐含概率对照，找出 AI 眼中的错价">
            <span className="zen-text">AI 定价</span> vs 市场
            <span className="ml-2 align-middle text-xs font-normal text-electric">powered by MiniMax</span>
          </SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {aiRows.map((a) => {
              const under = a.edge > 0;
              const rec = recommendYesNo(a.prob, a.market);
              return (
                <div key={a.code} className="card p-4">
                  <div className="flex items-center gap-3">
                    <Flag code={a.code} className="h-7 w-10" />
                    <div className="flex-1">
                      <div className="font-semibold text-white">{a.name}</div>
                      <div className="text-xs text-slate-400">
                        市场 {(a.market * 100).toFixed(1)}% · AI {(a.prob * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className={`text-right ${under ? "text-electric" : "text-flame"}`}>
                      <div className="heading text-2xl">
                        {under ? "▲" : "▼"} {Math.abs(a.edge * 100).toFixed(1)}%
                      </div>
                      <div className="text-[10px] uppercase tracking-wide">
                        {under ? "AI:被低估" : "AI:被高估"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
                    <span className="text-xs text-slate-400">{rec.reason}</span>
                    <TradeBadge label={rec.label} tone={rec.tone} />
                  </div>
                  {a.factors.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-white/10 pt-2">
                      {a.factors.map((f, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-slate-300">
                          <span className="text-gold-300">·</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            * AI 概率为 MiniMax 独立估计，未参考市场赔率；仅供参考，非投资建议。
          </p>
        </section>
      ) : (
        signals.length > 0 && (
          <section>
            <SectionTitle sub="模型胜率 vs 市场隐含概率，差值越大越可能错杀 / 高估">
              <span className="zen-text">价值雷达</span> · Model vs Market
            </SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {signals.map((s) => {
                const code = nameToCode.get(s.label);
                const under = s.edge > 0;
                return (
                  <div key={s.label} className="card flex items-center gap-3 p-4">
                    {code && <Flag code={code} className="h-7 w-10" />}
                    <div className="flex-1">
                      <div className="font-semibold text-white">{s.label}</div>
                      <div className="text-xs text-slate-400">
                        市场 {(s.market * 100).toFixed(1)}% · 模型 {(s.model * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className={`text-right ${under ? "text-electric" : "text-flame"}`}>
                      <div className="heading text-2xl">
                        {under ? "▲" : "▼"} {Math.abs(s.edge * 100).toFixed(1)}%
                      </div>
                      <div className="text-[10px] uppercase tracking-wide">
                        {under ? "低估·可关注" : "高估·谨慎"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )
      )}

      {/* ---------- HEAT BOARD ---------- */}
      <section id="heat">
        <SectionTitle sub="按热度（24h成交·总量·流动性·临场）排序，点击跳转原平台下注">
          热度排行榜
        </SectionTitle>
        {markets.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            暂时无法从 Polymarket 拉取盘口，请稍后刷新。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {markets.map((m, i) => (
              <MarketCard key={m.id} market={m} rank={i + 1} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- CHAMPION MODEL ---------- */}
      <section>
        <SectionTitle sub="基于 Elo 实力评分的自研夺冠概率模型">
          模型夺冠概率 Top 8
        </SectionTitle>
        <div className="card divide-y divide-white/5">
          {championProbabilities().slice(0, 8).map((c, i) => (
            <Link
              key={c.team.code}
              href={`/team/${c.team.code}`}
              className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/5"
            >
              <span className="heading w-6 text-lg text-white/40">{i + 1}</span>
              <Flag code={c.team.code} className="h-6 w-9" />
              <span className="flex-1 font-medium text-white">{c.team.zh} {c.team.name}</span>
              <div className="hidden h-2 w-40 overflow-hidden rounded-full bg-white/10 sm:block">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300"
                  style={{ width: `${c.prob * 100 * 4}%` }}
                />
              </div>
              <span className="w-14 text-right font-semibold tabular-nums text-gold-300">
                {(c.prob * 100).toFixed(1)}%
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 font-black tabular-nums text-white">{value}</div>
    </div>
  );
}

function TradeBadge({ label, tone }: { label: string; tone: "yes" | "no" | "watch" }) {
  const cls =
    tone === "yes"
      ? "border-emerald-400/35 bg-emerald-400/12 text-emerald-300"
      : tone === "no"
        ? "border-orange-400/35 bg-orange-400/12 text-orange-300"
        : "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${cls}`}>
      {label}
    </span>
  );
}

function abbr(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
