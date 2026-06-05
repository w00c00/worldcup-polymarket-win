import { NextRequest, NextResponse } from "next/server";
import { sendDueTomorrowBriefs } from "@/lib/daily-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return bearer === secret || request.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sent = await sendDueTomorrowBriefs();
  return NextResponse.json({ ok: true, sent });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
