import { after, NextResponse } from "next/server";
import { ingest, processDocument } from "@/lib/process";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST(req: Request) {
  const form = await req.formData();
  const source = form.get("source") === "scan" ? "scan" : "upload";
  const files = await Promise.all(
    form
      .getAll("files")
      .filter((f): f is File => f instanceof File && f.size > 0)
      .map(async (f) => ({ bytes: Buffer.from(await f.arrayBuffer()), type: f.type, name: f.name })),
  );

  try {
    const doc = await ingest(files, source);
    // Reading with AI takes a minute or two; respond now and process in the background.
    after(() => processDocument(doc.id));
    return NextResponse.json({ id: doc.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
