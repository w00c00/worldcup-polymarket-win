import "server-only";
import { getDb, ensureNotificationSettings, type NotificationSettings, type User } from "./db";
import { groupStageAnalysis, scoreMatrix } from "./model";
import { getMatchMarkets, getWorldCupMarkets, type MatchMarketSet } from "./polymarket";
import { MATCHES, TEAMS, teamByCode, type Match } from "./worldcup";
import { safeMatch } from "./ai";
import { sendUserNotifications } from "./notifications";

const DAY = 24 * 60 * 60 * 1000;

export type Brief = {
  title: string;
  body: string;
  matchCount: number;
  targetDate: string;
};

export async function buildTomorrowBrief({
  timezone,
  now = new Date(),
  includeAi = process.env.PUSH_INCLUDE_AI === "1",
}: {
  timezone: string;
  now?: Date;
  includeAi?: boolean;
}): Promise<Brief> {
  const targetDate = dateKey(new Date(now.getTime() + DAY), timezone);
  const matches = MATCHES.filter((match) => dateKey(new Date(match.kickoff), timezone) === targetDate);
  const marketByCode = await championMarketByCode();
  const title = matches.length
    ? `明日世界杯 ${matches.length} 场预测 · ${targetDate}`
    : `明日世界杯暂无比赛 · ${targetDate}`;
  if (!matches.length) {
    return { title, body: "明天没有已排定的世界杯比赛。", matchCount: 0, targetDate };
  }

  const blocks: string[] = [];
  for (const match of matches) blocks.push(await formatMatch(match, marketByCode, timezone, includeAi));
  return {
    title,
    body: [
      `推送时间：${formatDateTime(now, timezone)}`,
      "说明：模型概率来自 Elo、教练胜率、近期状态和球员池；市场价优先使用 Polymarket 单场盘口，找不到时退回冠军盘热度代理。",
      "",
      ...blocks,
      "",
      "仅供信息参考，非投资建议。",
    ].join("\n"),
    matchCount: matches.length,
    targetDate,
  };
}

export async function sendTomorrowBriefForUser(userId: number): Promise<Brief> {
  const settings = ensureNotificationSettings(userId);
  const brief = await buildTomorrowBrief({ timezone: settings.push_timezone });
  await sendUserNotifications(userId, brief.title, brief.body);
  return brief;
}

export async function sendDueTomorrowBriefs(now = new Date()): Promise<{ userId: number; title: string; matchCount: number }[]> {
  const users = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at, u.updated_at, ns.*
       FROM users u
       JOIN notification_settings ns ON ns.user_id = u.id
       WHERE ns.daily_push_enabled = 1 AND u.status = 'approved'`,
    )
    .all() as Array<User & NotificationSettings>;
  const sent: { userId: number; title: string; matchCount: number }[] = [];
  for (const user of users) {
    if (localHour(now, user.push_timezone) !== user.push_hour) continue;
    const brief = await buildTomorrowBrief({ timezone: user.push_timezone, now });
    if (!brief.matchCount && process.env.PUSH_EMPTY_DAYS !== "1") continue;
    await sendUserNotifications(user.id, brief.title, brief.body);
    sent.push({ userId: user.id, title: brief.title, matchCount: brief.matchCount });
  }
  return sent;
}

async function championMarketByCode(): Promise<Map<string, number>> {
  const markets = await getWorldCupMarkets();
  const winner = markets.find((market) => market.slug?.includes("winner")) ?? markets[0];
  const codeByName = new Map(TEAMS.map((team) => [team.name, team.code]));
  const marketByCode = new Map<string, number>();
  if (!winner) return marketByCode;
  for (const outcome of winner.outcomes) {
    const code = codeByName.get(outcome.label);
    if (code) marketByCode.set(code, outcome.price);
  }
  return marketByCode;
}

async function formatMatch(
  match: Match,
  marketByCode: Map<string, number>,
  timezone: string,
  includeAi: boolean,
): Promise<string> {
  const home = match.home ? teamByCode(match.home) : undefined;
  const away = match.away ? teamByCode(match.away) : undefined;
  if (!home || !away) {
    return [
      `【${formatDateTime(new Date(match.kickoff), timezone)}】${match.homeLabel ?? "TBD"} vs ${match.awayLabel ?? "TBD"}`,
      `${match.venue} · ${match.city}`,
      "淘汰赛对阵待产生，暂不输出胜平负预测。",
    ].join("\n");
  }

  const analysis = groupStageAnalysis(home.code, away.code, marketByCode);
  const realMarkets = await getMatchMarkets(home.code, away.code).catch(() => null);
  const p = analysis.adjusted;
  const favorite = p.home >= p.draw && p.home >= p.away ? home.zh : p.away >= p.home && p.away >= p.draw ? away.zh : "平局";
  const scores = scoreMatrix(home.code, away.code)
    .slice(0, 2)
    .map((score) => `${score.h}-${score.a} ${(score.p * 100).toFixed(1)}%`)
    .join(" / ");
  const ai = includeAi ? await safeMatch(home.code, away.code) : null;

  return [
    `【${formatDateTime(new Date(match.kickoff), timezone)}】${home.zh} vs ${away.zh}`,
    `${match.stage === "Group" ? `${match.group} 组` : match.stage} · ${match.venue} · ${match.city}`,
    `模型：${home.zh} ${(p.home * 100).toFixed(1)}% / 平 ${(p.draw * 100).toFixed(1)}% / ${away.zh} ${(p.away * 100).toFixed(1)}%，倾向 ${favorite}`,
    `公平赔率：${analysis.fairOdds.home.toFixed(2)} / ${analysis.fairOdds.draw.toFixed(2)} / ${analysis.fairOdds.away.toFixed(2)}`,
    `可能比分：${scores}`,
    realMarkets
      ? realMarketText(realMarkets, p, home.zh, away.zh)
      : analysis.market.home.marketChampion === undefined && analysis.market.away.marketChampion === undefined
      ? "市场：暂无双方冠军盘匹配"
      : `市场代理：${home.zh} ${marketText(analysis.market.home.marketChampion, analysis.market.home.edge)}；${away.zh} ${marketText(analysis.market.away.marketChampion, analysis.market.away.edge)}`,
    ai ? `AI 摘要：${ai.summary || ai.factors.join("；")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function realMarketText(
  markets: MatchMarketSet,
  model: { home: number; draw: number; away: number },
  homeName: string,
  awayName: string,
): string {
  const h = markets.markets.home;
  const d = markets.markets.draw;
  const a = markets.markets.away;
  return [
    `真实单场盘口：${markets.title}`,
    h ? `${homeName} ${marketText(h.price, model.home - h.price)} spread ${priceText(h.spread)}` : `${homeName} 暂无`,
    d ? `平局 ${marketText(d.price, model.draw - d.price)} spread ${priceText(d.spread)}` : "平局 暂无",
    a ? `${awayName} ${marketText(a.price, model.away - a.price)} spread ${priceText(a.spread)}` : `${awayName} 暂无`,
  ].join("；");
}

function marketText(price?: number, edge?: number): string {
  if (price === undefined) return "暂无";
  return `${(price * 100).toFixed(1)}%，edge ${edge === undefined ? "n/a" : `${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)}%`}`;
}

function priceText(value?: number): string {
  return value === undefined ? "--" : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function dateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function localHour(date: Date, timezone: string): number {
  const value = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).format(date);
  return Number(value);
}

function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
