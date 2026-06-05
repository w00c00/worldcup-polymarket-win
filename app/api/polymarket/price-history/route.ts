import { NextRequest, NextResponse } from "next/server";
import { getClobPriceHistory } from "@/lib/polymarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const intervals = new Set(["1m", "1h", "6h", "1d", "1w", "all", "max"]);

export async function GET(request: NextRequest) {
  const tokenId = request.nextUrl.searchParams.get("tokenId") || request.nextUrl.searchParams.get("market");
  if (!tokenId) return NextResponse.json({ error: "tokenId is required" }, { status: 400 });
  const days = Math.max(1, Math.min(365, Number(request.nextUrl.searchParams.get("days") ?? 7)));
  const intervalParam = request.nextUrl.searchParams.get("interval") ?? "1h";
  const interval = intervals.has(intervalParam) ? intervalParam : "1h";
  const fidelity = Math.max(1, Math.min(1440, Number(request.nextUrl.searchParams.get("fidelity") ?? 60)));
  const history = await getClobPriceHistory({ tokenId, days, interval: interval as any, fidelity });
  return NextResponse.json({ tokenId, days, interval, fidelity, history });
}
