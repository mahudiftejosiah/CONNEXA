import { NextResponse } from "next/server";
import { getUnreadCounts } from "@/lib/unread-counts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getUnreadCounts());
}
