import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processDocument } from "@/lib/process";

export const maxDuration = 800;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await db.sourceDocument.findUnique({ where: { id }, include: { _count: { select: { agreements: true } } } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.status !== "failed" || doc._count.agreements > 0) {
    return NextResponse.json({ error: "Only failed files without agreements can be re-read." }, { status: 409 });
  }
  await db.sourceDocument.update({ where: { id }, data: { status: "processing", error: null } });
  after(() => processDocument(id));
  return NextResponse.json({ id });
}
