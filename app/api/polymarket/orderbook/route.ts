import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getClobOrderBook, getClobSpread, getClobMidpoint } from "@/lib/polymarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tokenId = request.nextUrl.searchParams.get("tokenId") || request.nextUrl.searchParams.get("token_id");
  if (!tokenId) return NextResponse.json({ error: "tokenId is required" }, { status: 400 });
  const [book, spread, midpoint] = await Promise.all([
    getClobOrderBook(tokenId),
    getClobSpread(tokenId).catch(() => undefined),
    getClobMidpoint(tokenId).catch(() => undefined),
  ]);
  return NextResponse.json({ tokenId, spread, midpoint, book });
}
