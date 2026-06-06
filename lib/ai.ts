// MiniMax (China node) client for AI odds analysis.
// Principle: the AI prices events BLIND to any market/Polymarket price, so the
// AI-vs-market comparison stays meaningful. Server-side only; results cached.
import { TEAMS, teamByCode } from "./worldcup";
import { chatWithActiveProvider } from "./ai-providers";

type Msg = { role: "system" | "user" | "assistant"; content: string };

async function chat(messages: Msg[], maxTokens = 1400, timeoutMs = 8000): Promise<string> {
  return chatWithActiveProvider(messages, { maxTokens, temperature: 0.3, timeoutMs });
}

function extractJSON<T>(s: string): T {
  const cleaned = s.replace(/```json/gi, "").replace(/```/g, "");
  const start = cleaned.search(/[[{]/);
  if (start < 0) throw new Error("no json in response");
  // find matching end by scanning for last } or ]
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

// ---- tiny in-memory TTL cache (per server process) ----
const cache = new Map<string, { t: number; v: unknown }>();
const TTL = 30 * 60 * 1000; // 30 min
const failureCache = new Map<string, number>();
const FAILURE_TTL = 5 * 60 * 1000;
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v as T;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

export type AiChampion = { code: string; name: string; prob: number; factors: string[] };

// Independent (blind-to-market) champion probability for top contenders.
export async function aiChampionAnalysis(): Promise<AiChampion[]> {
  return cached("champ", async () => {
    const contenders = [...TEAMS].sort((a, b) => b.elo - a.elo).slice(0, 12);
    const list = contenders.map((t) => `${t.name}(FIFA#${t.fifaRank})`).join(", ");
    const sys: Msg = {
      role: "system",
      content:
        "你是资深足球赛事分析师，为 2026 年世界杯做夺冠概率的独立评估。" +
        "只依据你对各队实力、阵容深度、近期状态与历史大赛表现的认知给出判断，" +
        "严禁参考任何博彩公司或预测市场（如 Polymarket）的赔率。",
    };
    const usr: Msg = {
      role: "user",
      content:
        `请为以下球队各自评估夺得 2026 世界杯冠军的概率（百分比，各队独立估计，不必加和为100）：\n${list}\n\n` +
        `只返回 JSON 数组，每个元素：{"team": 英文队名(与上面一致), "prob": 数字(0-100), "factors": [两条简短中文关键理由]}。不要输出 JSON 以外的任何文字。`,
    };
    const raw = await chat([sys, usr], 1400, 3500);
    const arr = extractJSON<{ team: string; prob: number; factors: string[] }[]>(raw);
    const byName = new Map(TEAMS.map((t) => [t.name.toLowerCase(), t]));
    return arr
      .map((a) => {
        const t = byName.get(String(a.team).toLowerCase());
        if (!t) return null;
        return {
          code: t.code,
          name: t.name,
          prob: Math.max(0, Math.min(100, Number(a.prob))) / 100,
          factors: Array.isArray(a.factors) ? a.factors.slice(0, 2) : [],
        };
      })
      .filter(Boolean) as AiChampion[];
  });
}

export type AiMatch = {
  home: number;
  draw: number;
  away: number;
  confidence: number;
  factors: string[];
  summary: string;
};

export async function aiMatchAnalysis(homeCode: string, awayCode: string): Promise<AiMatch> {
  const h = teamByCode(homeCode);
  const a = teamByCode(awayCode);
  if (!h || !a) throw new Error("unknown teams");
  return cached(`match:${homeCode}:${awayCode}`, async () => {
    const sys: Msg = {
      role: "system",
      content:
        "你是资深足球赛事分析师。为指定对阵做独立的胜平负概率评估，" +
        "只依据两队实力、阵容、近期状态与战术克制，严禁参考任何博彩或预测市场赔率。",
    };
    const usr: Msg = {
      role: "user",
      content:
        `对阵：${h.name}(主, FIFA#${h.fifaRank}) vs ${a.name}(客, FIFA#${a.fifaRank})，2026 世界杯小组赛，中立球场。\n` +
        `只返回 JSON：{"home": 主胜概率%, "draw": 平局概率%, "away": 客胜概率%, "confidence": 0到1的把握度, "factors": [三条简短中文关键依据], "summary": "一句话中文总结"}。三个概率加和为100。不要输出 JSON 以外的文字。`,
    };
    const raw = await chat([sys, usr], 900, 4500);
    const o = extractJSON<any>(raw);
    const sum = (Number(o.home) + Number(o.draw) + Number(o.away)) || 100;
    return {
      home: Number(o.home) / sum,
      draw: Number(o.draw) / sum,
      away: Number(o.away) / sum,
      confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0.5)),
      factors: Array.isArray(o.factors) ? o.factors.slice(0, 3) : [],
      summary: String(o.summary || ""),
    };
  });
}

// Safe wrappers — never break the page if MiniMax is unavailable.
export async function safeChampion(): Promise<AiChampion[]> {
  if ((failureCache.get("champ") ?? 0) > Date.now()) return [];
  try {
    return await aiChampionAnalysis();
  } catch {
    failureCache.set("champ", Date.now() + FAILURE_TTL);
    return [];
  }
}
export async function safeMatch(h: string, a: string): Promise<AiMatch | null> {
  const key = `match:${h}:${a}`;
  if ((failureCache.get(key) ?? 0) > Date.now()) return null;
  try {
    return await aiMatchAnalysis(h, a);
  } catch {
    failureCache.set(key, Date.now() + FAILURE_TTL);
    return null;
  }
}
