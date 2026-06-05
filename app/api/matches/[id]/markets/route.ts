import { NextResponse } from "next/server";
import { getMatchMarkets } from "@/lib/polymarket";
import { matchById } from "@/lib/worldcup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = matchById(id);
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });
  if (!match.home || !match.away) return NextResponse.json({ matchId: id, markets: null });
  const markets = await getMatchMarkets(match.home, match.away);
  return NextResponse.json({ matchId: id, markets });
}
