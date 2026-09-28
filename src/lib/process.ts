import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { extractAgreements } from "./extraction/extract";
import { DOCUMENT_TYPES, type ExtractedDocument, type ExtractionResult, type Flag } from "./extraction/schema";
import { computeExpiry, parsePrintedDate, validateDocument } from "./extraction/validate";
import { bestMatch, similarity } from "./matching";
import { countPages, imagesToPdf } from "./pdf";
import { readOriginal, saveOriginal } from "./storage";

type IncomingFile = { bytes: Buffer; type: string; name: string };

/** Saves the upload (combining camera photos into one PDF) and records it as processing. */
export async function ingest(files: IncomingFile[], source: "upload" | "scan", uploadedBy?: string) {
  if (files.length === 0) throw new Error("No file received");

  let pdf: Buffer;
  let originalName: string;
  if (files.length === 1 && files[0].type === "application/pdf") {
    pdf = files[0].bytes;
    originalName = files[0].name;
  } else {
    const unsupported = files.find((f) => !["image/jpeg", "image/png"].includes(f.type));
    if (unsupported) throw new Error(`Unsupported file "${unsupported.name}". Upload one PDF, or JPG/PNG photos of each page.`);
    pdf = await imagesToPdf(files);
    originalName = source === "scan" ? `Scan ${new Date().toISOString().slice(0, 16).replace("T", " ")}.pdf` : `${files[0].name.replace(/\.[^.]+$/, "")}.pdf`;
  }

  const pageCount = await countPages(pdf);
  const { sha256, storedName } = await saveOriginal(pdf, ".pdf");
  return db.sourceDocument.create({
    data: { originalName, storedName, sha256, mimeType: "application/pdf", sizeBytes: pdf.length, pageCount, source, uploadedBy },
  });
}

/** Reads the file with Claude and creates one Agreement per document found. */
export async function processDocument(sourceDocumentId: string, provided?: ExtractionResult) {
  const doc = await db.sourceDocument.findUniqueOrThrow({ where: { id: sourceDocumentId } });
  try {
    let result = provided;
    let model = "provided";
    if (!result) {
      ({ result, model } = await extractAgreements(await readOriginal(doc.storedName)));
    }
    if (result.documents.length === 0) throw new Error("No agreement was recognised in this file.");

    const [universities, companies] = await Promise.all([db.university.findMany(), db.company.findMany()]);

    for (const extracted of result.documents) {
      const university = bestMatch(extracted.university?.name, universities);
      const company =
        bestMatch(extracted.company?.name, companies) ??
        extracted.other_parties.map((p) => bestMatch(p.name, companies)).find(Boolean) ??
        null;

      const fields = agreementFields(extracted, doc.pageCount);
      if (university) fields.flags.push(...(await crossDocumentFlags(university.id, extracted)));

      await db.agreement.create({
        data: {
          ...fields,
          flags: fields.flags as unknown as Prisma.InputJsonValue,
          sourceDocumentId: doc.id,
          universityId: university?.id,
          companyId: company?.id,
          auditLogs: { create: { action: "extracted", newValue: `${model}; university ${university ? "matched" : "unmatched"}; company ${company ? "matched" : "unmatched"}` } },
        },
      });
    }

    await db.sourceDocument.update({
      where: { id: doc.id },
      data: { status: "done", model, rawExtraction: result as unknown as Prisma.InputJsonValue, error: null },
    });
  } catch (err) {
    console.error("Processing failed", sourceDocumentId, err);
    await db.sourceDocument.update({
      where: { id: doc.id },
      data: { status: "failed", error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/** The columns derived from an extracted document. Reused after manual edits. */
export function agreementFields(extracted: ExtractedDocument, pageCount: number) {
  const dateIso = extracted.document_date_iso ?? parsePrintedDate(extracted.document_date_text);
  return {
    pageStart: extracted.page_start,
    pageEnd: extracted.page_end,
    type: extracted.document_type,
    typeLabel: DOCUMENT_TYPES[extracted.document_type] ?? extracted.document_type_label,
    title: extracted.title ?? extracted.document_type_label,
    agreementDateText: extracted.document_date_text,
    agreementDate: dateIso ? new Date(dateIso + "T00:00:00Z") : null,
    academicYear: extracted.academic_year,
    termText: extracted.term_text,
    termYears: extracted.term_years,
    autoRenewal: extracted.auto_renewal,
    expiryDate: computeExpiry(dateIso, extracted.term_years),
    summary: extracted.summary,
    fullText: extracted.full_text,
    data: extracted as unknown as Prisma.InputJsonValue,
    flags: validateDocument(extracted, pageCount),
  };
}

/** Compares a letter's reference to its parent agreement with the one already on file. */
async function crossDocumentFlags(universityId: string, extracted: ExtractedDocument): Promise<Flag[]> {
  const ref = extracted.referenced_agreement;
  if (!ref) return [];
  const refIso = ref.date_iso ?? parsePrintedDate(ref.date_text);
  if (!refIso) return [];

  const existing = await db.agreement.findMany({ where: { universityId, agreementDate: { not: null } } });
  const flags: Flag[] = [];
  for (const a of existing) {
    const titleScore = Math.max(similarity(ref.text, a.title ?? ""), similarity(ref.text, a.typeLabel));
    const onFileIso = a.agreementDate!.toISOString().slice(0, 10);
    if (titleScore >= 0.4 && onFileIso !== refIso) {
      flags.push({
        severity: "warning",
        source: "check",
        page: extracted.page_start,
        message: `Refers to "${ref.text}" dated "${ref.date_text}", but the ${a.typeLabel} on file is dated "${a.agreementDateText}".`,
      });
    }
  }
  return flags;
}
