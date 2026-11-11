import { NextRequest, NextResponse } from "next/server";
import { fetchScoreDay, isSport, shiftUtcDate, todayUtc, type ScoreDay } from "@/lib/scores";

// Livescore, Flashscore and the rest refuse to be framed and need JavaScript of
// their own, so the fixtures are read here on the server and drawn inside
// CONNEXA instead of sending the reader off the site.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get("sport") || "soccer";
  if (!isSport(sport)) return NextResponse.json({ error: "Unknown sport." }, { status: 400 });

  const offset = Math.min(7, Math.max(-7, Number(req.nextUrl.searchParams.get("offset") || 0) || 0));
  const day: ScoreDay = await fetchScoreDay(sport, shiftUtcDate(todayUtc(), offset));
  if (day.groups.length === 0) {
    return NextResponse.json({ ...day, error: "The score service sent nothing back just now." }, { status: 502 });
  }
  return NextResponse.json(day, { headers: { "cache-control": "public, max-age=0, s-maxage=60" } });
}
