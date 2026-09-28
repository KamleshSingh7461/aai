// Runs a file through the real pipeline with a known extraction instead of
// calling Claude. Used to test matching, checks and screens without an API key.
//   npx tsx scripts/import-fixture.ts <file.pdf> <extraction.json>
import { readFile } from "fs/promises";
import path from "path";
import { db } from "../src/lib/db";
import { ExtractionResult } from "../src/lib/extraction/schema";
import { ingest, processDocument } from "../src/lib/process";

async function main() {
  const [pdfPath, jsonPath] = process.argv.slice(2);
  if (!pdfPath || !jsonPath) throw new Error("Usage: tsx scripts/import-fixture.ts <file.pdf> <extraction.json>");
  const extraction = ExtractionResult.parse(JSON.parse(await readFile(jsonPath, "utf8")));
  const doc = await ingest([{ bytes: await readFile(pdfPath), type: "application/pdf", name: path.basename(pdfPath) }], "upload", "fixture");
  await processDocument(doc.id, extraction);
  const result = await db.sourceDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { agreements: true } });
  console.log(`${result.status}: ${result.agreements.length} agreement(s)${result.error ? ` – ${result.error}` : ""}`);
  for (const a of result.agreements) {
    console.log(`\n${a.typeLabel} p.${a.pageStart}-${a.pageEnd} university=${a.universityId ?? "unmatched"} company=${a.companyId ?? "unmatched"}`);
    for (const f of a.flags as { severity: string; message: string }[]) console.log(`  [${f.severity}] ${f.message}`);
  }
}

main().finally(() => db.$disconnect());
