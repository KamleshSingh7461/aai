import { db } from "@/lib/db";
import { readOriginal } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await db.sourceDocument.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  const bytes = await readOriginal(doc.storedName);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.originalName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
