import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bookText, gutenbergId } from "@/lib/gutenberg";

// Hands the in-app reader a book as paragraphs. The text is fetched here rather
// than in the browser because Project Gutenberg does not send CORS headers, and
// because one warmed copy serves every reader of the same title.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const bookId = req.nextUrl.searchParams.get("book");
  if (!bookId || !/^[0-9a-f-]{36}$/.test(bookId)) {
    return NextResponse.json({ error: "No such book." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: book } = await supabase
    .from("study_books")
    .select("id, title, pdf_url")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) return NextResponse.json({ error: "No such book." }, { status: 404 });

  const id = gutenbergId(book.pdf_url);
  if (!id) return NextResponse.json({ external: book.pdf_url });

  // A reader pressing Retry asks for a fresh attempt, not the remembered failure.
  const force = req.nextUrl.searchParams.get("retry") === "1";
  const result = await bookText(id, force);

  if (!result.ok) {
    if (result.reason === "unavailable") {
      return NextResponse.json(
        {
          error: "Project Gutenberg is serving a maintenance page right now, so no title can be fetched. Your place in the book is kept — try again in a few minutes.",
          retry: true,
        },
        { status: 503, headers: { "cache-control": "no-store" } }
      );
    }
    return NextResponse.json(
      {
        error: "Project Gutenberg has no readable text edition of this title — it is published only as a scan or an image file. It still opens on Gutenberg itself.",
        retry: true,
      },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }

  return NextResponse.json(
    { paragraphs: result.paragraphs, source: result.url, format: result.format },
    { headers: { "cache-control": "public, max-age=0, s-maxage=86400" } }
  );
}