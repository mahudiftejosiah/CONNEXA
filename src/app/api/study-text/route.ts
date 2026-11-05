import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bookParagraphs, gutenbergId } from "@/lib/gutenberg";

// Hands the in-app reader a book as paragraphs. The text is fetched here rather
// than in the browser because Project Gutenberg does not send CORS headers, and
// because one warmed copy serves every reader of the same title.
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

  const paragraphs = await bookParagraphs(id);
  if (!paragraphs) {
    return NextResponse.json(
      { error: "Project Gutenberg has no plain text for this title yet." },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { paragraphs, source: book.pdf_url },
    { headers: { "cache-control": "public, max-age=0, s-maxage=86400" } }
  );
}
