import type { ExtractedDocument, Flag } from "./schema";

// Deterministic checks run on every extraction and again after every manual
// edit. They only report; nothing here changes an extracted value.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Digits (and decimal point) of a printed amount: "₹ 2,20,000,000" -> 220000000, "37500/-" -> 37500. */
export function numberFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/\/-\s*$/, "").replace(/[^\d.]/g, "").replace(/\.$/, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parses the date formats seen on our documents; returns YYYY-MM-DD or null. */
export function parsePrintedDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/\s+/g, " ").trim();

  const numeric = t.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/);
  if (numeric) return toIso(+numeric[3], +numeric[2], +numeric[1]);

  const month = MONTHS.findIndex((m) => t.includes(m) || t.includes(m.slice(0, 3) + " "));
  const year = t.match(/\b(19|20)\d{2}\b/);
  const day = t.match(/\b(\d{1,2})\b/);
  if (month >= 0 && year && day) return toIso(+year[0], month + 1, +day[1]);
  return null;
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

const fmt = (n: number) => n.toLocaleString("en-IN");

function checkPair(flags: Flag[], label: string, text: string | null, value: number | null, page: number) {
  if (text == null && value == null) return;
  const fromText = numberFromText(text);
  if (value != null && fromText != null && fromText !== value) {
    flags.push({ severity: "warning", source: "check", page, message: `${label}: printed "${text}" but stored number is ${fmt(value)}. Check the scan.` });
  }
  if (text && fromText == null && value != null) {
    flags.push({ severity: "warning", source: "check", page, message: `${label}: stored number ${fmt(value)} has no printed digits ("${text}").` });
  }
}

function checkProduct(flags: Flag[], label: string, a: number | null, b: number | null, printed: number | null, printedText: string | null, page: number) {
  if (a == null || b == null || printed == null) return;
  const expected = a * b;
  if (Math.abs(expected - printed) > 0.5) {
    flags.push({
      severity: "warning",
      source: "check",
      page,
      message: `${label}: ${fmt(a)} × ${fmt(b)} = ${fmt(expected)}, but the document prints "${printedText}". Confirm with the university which figure is correct.`,
    });
  }
}

export function validateDocument(doc: ExtractedDocument, pageCount: number): Flag[] {
  const flags: Flag[] = doc.issues.map((i) => ({ severity: i.severity, source: "ai" as const, message: i.message, page: i.page }));

  if (doc.page_start < 1 || doc.page_end > pageCount || doc.page_start > doc.page_end) {
    flags.push({ severity: "warning", source: "check", message: `Page range ${doc.page_start}-${doc.page_end} is outside the file's ${pageCount} pages.` });
  }
  if (!doc.university) flags.push({ severity: "warning", source: "check", message: "No university found on the document." });
  if (!doc.company) flags.push({ severity: "warning", source: "check", message: "No company party found on the document." });

  // Dates
  const parsed = parsePrintedDate(doc.document_date_text);
  if (!doc.document_date_text) {
    flags.push({ severity: "warning", source: "check", page: doc.page_start, message: "No date found on the document." });
  } else if (parsed && doc.document_date_iso && parsed !== doc.document_date_iso) {
    flags.push({ severity: "warning", source: "check", page: doc.page_start, message: `Date printed as "${doc.document_date_text}" but stored as ${doc.document_date_iso}.` });
  }
  const refIso = doc.referenced_agreement?.date_iso ?? parsePrintedDate(doc.referenced_agreement?.date_text);
  const docIso = doc.document_date_iso ?? parsed;
  if (refIso && docIso && refIso > docIso) {
    flags.push({
      severity: "warning",
      source: "check",
      page: doc.page_start,
      message: `Document is dated "${doc.document_date_text}" but refers to an agreement dated "${doc.referenced_agreement?.date_text}", which is later.`,
    });
  }

  // Scholarship arithmetic, using only printed numbers.
  for (const t of doc.scholarship_tiers) {
    const name = t.name || "Scholarship tier";
    checkPair(flags, `${name} – quantity`, t.quantity_text, t.quantity, t.page);
    checkPair(flags, `${name} – value per scholarship per year`, t.value_per_scholarship_per_year_text, t.value_per_scholarship_per_year, t.page);
    checkPair(flags, `${name} – total annual value`, t.total_annual_value_text, t.total_annual_value, t.page);
    checkPair(flags, `${name} – total multi-year value`, t.total_multi_year_value_text, t.total_multi_year_value, t.page);
    checkProduct(flags, `${name} – annual total`, t.quantity, t.value_per_scholarship_per_year, t.total_annual_value, t.total_annual_value_text, t.page);
    checkProduct(flags, `${name} – multi-year total`, t.total_annual_value, t.duration_years, t.total_multi_year_value, t.total_multi_year_value_text, t.page);
  }

  const totals = doc.scholarship_totals;
  if (totals) {
    checkPair(flags, "Combined annual value", totals.combined_annual_value_text, totals.combined_annual_value, totals.page);
    checkPair(flags, "Combined multi-year value", totals.combined_multi_year_value_text, totals.combined_multi_year_value, totals.page);

    const annuals = doc.scholarship_tiers.map((t) => t.total_annual_value);
    if (annuals.length > 0 && annuals.every((v) => v != null) && totals.combined_annual_value != null) {
      const sum = annuals.reduce((s, v) => s + (v as number), 0);
      if (Math.abs(sum - totals.combined_annual_value) > 0.5) {
        flags.push({ severity: "warning", source: "check", page: totals.page, message: `Tier annual totals add up to ${fmt(sum)}, but combined annual value is printed as "${totals.combined_annual_value_text}".` });
      }
    }

    const years = doc.scholarship_tiers.map((t) => t.duration_years).find((y) => y != null) ?? inferYears(totals.combined_multi_year_value_text, doc.full_text);
    checkProduct(flags, "Combined multi-year value", totals.combined_annual_value, years ?? null, totals.combined_multi_year_value, totals.combined_multi_year_value_text, totals.page);
  }

  // Unfilled template placeholders such as [ADDRESS].
  const placeholders = new Set(doc.full_text.match(/\[[A-Z][A-Z _]{2,}\]/g) ?? []);
  for (const p of placeholders) {
    flags.push({ severity: "warning", source: "check", message: `Unfilled placeholder ${p} in the document text.` });
  }

  // Handwritten or low-confidence values always need a human look.
  for (const f of [...doc.key_fields, ...doc.financial_terms]) {
    if (f.handwritten || f.confidence === "low") {
      flags.push({ severity: "info", source: "check", page: f.page, message: `${f.handwritten ? "Handwritten" : "Low-confidence"} value – verify "${f.label}: ${f.value}".` });
    }
  }

  return dedupe(flags);
}

function inferYears(...texts: (string | null)[]): number | null {
  const joined = texts.filter(Boolean).join(" ").toLowerCase();
  if (/four[- ]year/.test(joined)) return 4;
  if (/three[- ]year/.test(joined)) return 3;
  return null;
}

function dedupe(flags: Flag[]): Flag[] {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const key = f.message.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function computeExpiry(dateIso: string | null, termYears: number | null): Date | null {
  if (!dateIso || !termYears) return null;
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + termYears);
  return d;
}
