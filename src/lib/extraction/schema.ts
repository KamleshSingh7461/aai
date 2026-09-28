import { z } from "zod";
import { DOCUMENT_TYPES, type DocumentType } from "./types";

// Every value the model reads off the page is kept twice where it matters:
// `*_text` is the exact printed characters, the typed field is the parsed value.
// Validation later checks the two agree, so a mis-read digit gets flagged.

export { DOCUMENT_TYPES, type DocumentType };

const typeKeys = Object.keys(DOCUMENT_TYPES) as [DocumentType, ...DocumentType[]];

const confidence = z.enum(["high", "medium", "low"]);

const Party = z.object({
  name: z.string().describe("Name exactly as printed"),
  address: z.string().nullable().describe("Address exactly as printed, or null"),
  role: z.string().describe("Role in the document, e.g. 'University', 'Company', 'Recipient', 'Supporting party'"),
});

const KeyField = z.object({
  label: z.string(),
  value: z.string().describe("Exact printed text. Never reformat, never add currency symbols or units."),
  page: z.number().int(),
  confidence,
  handwritten: z.boolean(),
});

const ScholarshipTier = z.object({
  name: z.string().describe("Tier name as printed, e.g. 'Four-Year Full-Ride Scholarships'"),
  quantity_text: z.string().nullable(),
  quantity: z.number().int().nullable(),
  duration_text: z.string().nullable(),
  duration_years: z.number().int().nullable(),
  value_per_scholarship_per_year_text: z.string().nullable(),
  value_per_scholarship_per_year: z.number().nullable(),
  total_annual_value_text: z.string().nullable(),
  total_annual_value: z.number().nullable(),
  total_multi_year_value_text: z.string().nullable(),
  total_multi_year_value: z.number().nullable(),
  inclusions: z.array(z.object({ item: z.string(), value_text: z.string() })),
  page: z.number().int(),
});

const ScholarshipTotals = z.object({
  combined_annual_value_text: z.string().nullable(),
  combined_annual_value: z.number().nullable(),
  combined_multi_year_value_text: z.string().nullable(),
  combined_multi_year_value: z.number().nullable(),
  currency_as_printed: z.string().nullable().describe("Currency symbol/word exactly as printed, e.g. '₹', 'INR', '/-'. Null if none printed."),
  page: z.number().int(),
});

export const ExtractedDocument = z.object({
  page_start: z.number().int().describe("1-based first page of this document within the file"),
  page_end: z.number().int(),
  document_type: z.enum(typeKeys),
  document_type_label: z.string().describe("Heading or subject line as printed"),
  title: z.string().nullable(),
  university: Party.nullable().describe("The university / college party"),
  company: Party.nullable().describe("The main company party on the other side (not the university)"),
  other_parties: z.array(Party),
  document_date_text: z.string().nullable().describe("Date exactly as printed (including handwriting)"),
  document_date_iso: z.string().nullable().describe("YYYY-MM-DD. Indian documents use DD/MM/YYYY. Null if unclear."),
  academic_year: z.string().nullable(),
  term_text: z.string().nullable(),
  term_years: z.number().int().nullable(),
  auto_renewal: z.boolean().nullable(),
  notice_period_text: z.string().nullable(),
  referenced_agreement: z
    .object({
      text: z.string().describe("How the document refers to its parent agreement, verbatim"),
      date_text: z.string().nullable(),
      date_iso: z.string().nullable(),
      section: z.string().nullable(),
    })
    .nullable(),
  scholarship_tiers: z.array(ScholarshipTier),
  scholarship_totals: ScholarshipTotals.nullable(),
  financial_terms: z.array(KeyField).describe("Profit share, fees, payments, valuations not covered above"),
  obligations: z.array(
    z.object({ party: z.string(), obligation: z.string(), deadline_text: z.string().nullable(), page: z.number().int() }),
  ),
  key_fields: z.array(KeyField).describe("Any other important term a reader would look for"),
  signatories: z.array(
    z.object({
      name: z.string().nullable(),
      designation: z.string().nullable(),
      organisation: z.string().nullable(),
      page: z.number().int(),
      handwritten: z.boolean(),
    }),
  ),
  stamps: z.array(z.object({ text: z.string(), page: z.number().int() })),
  summary: z.string().describe("2-3 plain sentences describing what this document does"),
  issues: z.array(
    z.object({
      severity: z.enum(["warning", "info"]),
      message: z.string(),
      page: z.number().int().nullable(),
    }),
  ).describe("Inconsistencies, blanks, placeholders, unreadable parts. Report; never fix."),
  full_text: z.string().describe("Verbatim transcription of these pages"),
});

export const ExtractionResult = z.object({
  page_count: z.number().int(),
  documents: z.array(ExtractedDocument),
});

export type ExtractedDocument = z.infer<typeof ExtractedDocument>;
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export type Flag = {
  severity: "warning" | "info";
  source: "ai" | "check";
  message: string;
  page?: number | null;
};
