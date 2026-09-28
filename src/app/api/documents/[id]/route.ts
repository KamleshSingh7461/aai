import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// A read can run up to the route's maxDuration (~13 min). Anything still "processing"
// well past that was interrupted, e.g. by a server restart, and would otherwise spin forever.
const STALE_AFTER_MS = 20 * 60 * 1000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const select = {
    id: true, status: true, error: true, originalName: true, pageCount: true, updatedAt: true,
    agreements: { select: { id: true, typeLabel: true, pageStart: true, pageEnd: true }, orderBy: { pageStart: "asc" as const } },
  };
  let doc = await db.sourceDocument.findUnique({ where: { id }, select });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (doc.status === "processing" && Date.now() - doc.updatedAt.getTime() > STALE_AFTER_MS) {
    doc = await db.sourceDocument.update({
      where: { id },
      data: { status: "failed", error: "Reading was interrupted before it finished (the app may have been restarted). Press Try again." },
      select,
    });
  }
  return NextResponse.json(doc);
}
