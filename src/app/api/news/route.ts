import { NextRequest, NextResponse } from "next/server";
import { fetchNewsArticle, isNewsLinkAllowed } from "@/lib/news";

// Reads a story for the Discover tab. The page is fetched here rather than in
// the browser because the news site sends no CORS headers, and one warmed copy
// serves everyone who opens the same headline.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  if (!isNewsLinkAllowed(url)) {
    return NextResponse.json({ error: "That link is not a news story we can open." }, { status: 400 });
  }

  try {
    const article = await fetchNewsArticle(url);
    if (!article || article.paragraphs.length === 0) {
      return NextResponse.json({ error: "The story could not be read just now." }, { status: 502 });
    }
    return NextResponse.json(article, {
      headers: { "cache-control": "public, max-age=0, s-maxage=1800" },
    });
  } catch {
    return NextResponse.json({ error: "The story could not be read just now." }, { status: 502 });
  }
}
