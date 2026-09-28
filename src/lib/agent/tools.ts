import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import type { ExtractedDocument, Flag } from "../extraction/schema";
import { DOCUMENT_TYPES } from "../extraction/types";

// Read-only tools the Vault Agent can call. Nothing here writes to the database:
// the agent looks things up and explains; people approve and edit.

const typeKeys = Object.keys(DOCUMENT_TYPES) as [string, ...string[]];
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const link = (id: string) => `/agreements/${id}`;

function openChecks(flags: unknown) {
  return (Array.isArray(flags) ? (flags as Flag[]) : []).filter((f) => f.severity === "warning").map((f) => f.message);
}

const agreementInclude = { university: { select: { id: true, name: true } }, company: { select: { code: true, name: true } } } as const;
type AgreementRow = Prisma.AgreementGetPayload<{ include: typeof agreementInclude }>;

function brief(a: AgreementRow) {
  return {
    id: a.id,
    link: link(a.id),
    type: a.typeLabel,
    title: a.title,
    university: a.university?.name ?? null,
    university_id: a.university?.id ?? null,
    company: a.company ? `${a.company.code} (${a.company.name})` : null,
    date_as_printed: a.agreementDateText,
    academic_year: a.academicYear,
    term_as_printed: a.termText,
    term_ends_calculated: iso(a.expiryDate),
    status: a.status === "approved" ? "approved" : "not yet verified by a reviewer",
    open_checks: openChecks(a.flags).length,
    summary: a.summary,
  };
}

async function universityIds(name?: string) {
  if (!name) return undefined;
  const unis = await db.university.findMany({ select: { id: true, name: true, aliases: true } });
  const q = name.toLowerCase();
  return unis
    .filter((u) => [u.name, ...(Array.isArray(u.aliases) ? (u.aliases as string[]) : [])].some((n) => n.toLowerCase().includes(q)))
    .map((u) => u.id);
}

type ToolDef<S extends z.ZodType> = {
  schema: S;
  description: string;
  input_schema: Anthropic.Tool["input_schema"];
  /** Short human label shown in the activity timeline. */
  label: (input: z.infer<S>) => string;
  run: (input: z.infer<S>) => Promise<{ result: unknown; summary: string }>;
};

function tool<S extends z.ZodType>(def: ToolDef<S>) {
  return def;
}

export const TOOLS = {
  get_overview: tool({
    description: "Totals across the whole vault: number of universities, agreements by company, by type and by review status. Use first for broad questions.",
    input_schema: { type: "object", properties: {}, required: [] },
    schema: z.object({}),
    label: () => "Reading vault overview",
    run: async () => {
      const [universities, agreements] = await Promise.all([
        db.university.count(),
        db.agreement.findMany({ select: { type: true, status: true, company: { select: { code: true } } } }),
      ]);
      const count = (key: (a: (typeof agreements)[number]) => string) =>
        agreements.reduce<Record<string, number>>((acc, a) => ((acc[key(a)] = (acc[key(a)] ?? 0) + 1), acc), {});
      return {
        result: {
          universities,
          agreements: agreements.length,
          by_company: count((a) => a.company?.code ?? "unassigned"),
          by_type: count((a) => DOCUMENT_TYPES[a.type as keyof typeof DOCUMENT_TYPES] ?? a.type),
          by_status: count((a) => a.status),
        },
        summary: `${agreements.length} agreements across ${universities} universities`,
      };
    },
  }),

  list_universities: tool({
    description: "List universities (optionally filtered by part of the name) with how many agreements each has per company and which agreement types are on file.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "Part of the university name" } }, required: [] },
    schema: z.object({ name: z.string().optional() }),
    label: (i) => (i.name ? `Looking up universities matching “${i.name}”` : "Listing universities"),
    run: async ({ name }) => {
      const ids = await universityIds(name);
      const unis = await db.university.findMany({
        where: ids ? { id: { in: ids } } : undefined,
        include: { agreements: { select: { typeLabel: true, status: true, company: { select: { code: true } } } } },
        orderBy: { name: "asc" },
        take: 60,
      });
      const result = unis.map((u) => ({
        id: u.id,
        name: u.name,
        address: u.address,
        agreements: u.agreements.length,
        by_company: u.agreements.reduce<Record<string, number>>((acc, a) => ((acc[a.company?.code ?? "unassigned"] = (acc[a.company?.code ?? "unassigned"] ?? 0) + 1), acc), {}),
        types_on_file: [...new Set(u.agreements.map((a) => a.typeLabel))],
        awaiting_review: u.agreements.filter((a) => a.status !== "approved").length,
      }));
      return { result, summary: `Found ${result.length} universit${result.length === 1 ? "y" : "ies"}` };
    },
  }),

  search_agreements: tool({
    description: "Find agreements by university, company code, type or review status. Returns a short record for each, with a link.",
    input_schema: {
      type: "object",
      properties: {
        university: { type: "string", description: "Part of the university name" },
        company: { type: "string", description: "Company code, e.g. EUSAI, ACI, FGSN, SDN, EFLI, ESI" },
        type: { type: "string", enum: typeKeys, description: "Agreement type key" },
        status: { type: "string", enum: ["approved", "needs_review"] },
      },
      required: [],
    },
    schema: z.object({
      university: z.string().optional(),
      company: z.string().optional(),
      type: z.enum(typeKeys).optional(),
      status: z.enum(["approved", "needs_review"]).optional(),
    }),
    label: (i) => `Searching agreements${[i.university, i.company, i.type && DOCUMENT_TYPES[i.type as keyof typeof DOCUMENT_TYPES], i.status].filter(Boolean).map((s) => ` · ${s}`).join("")}`,
    run: async ({ university, company, type, status }) => {
      const ids = await universityIds(university);
      const rows = await db.agreement.findMany({
        where: {
          ...(ids ? { universityId: { in: ids } } : {}),
          ...(company ? { company: { code: company.toUpperCase() } } : {}),
          ...(type ? { type } : {}),
          ...(status ? { status } : {}),
        },
        include: agreementInclude,
        orderBy: [{ agreementDate: "desc" }, { createdAt: "desc" }],
        take: 50,
      });
      return { result: rows.map(brief), summary: `Found ${rows.length} agreement${rows.length === 1 ? "" : "s"}` };
    },
  }),

  get_agreement: tool({
    description: "Open one agreement: every extracted value exactly as printed with page numbers, scholarship tiers and totals, signatories, open checks, and the transcription.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    schema: z.object({ id: z.string() }),
    label: () => "Opening agreement",
    run: async ({ id }) => {
      const a = await db.agreement.findUnique({ where: { id }, include: { ...agreementInclude, sourceDocument: { select: { originalName: true } } } });
      if (!a) return { result: { error: "No agreement with that id" }, summary: "Not found" };
      const { full_text, ...data } = a.data as unknown as ExtractedDocument;
      return {
        result: {
          ...brief(a),
          file: a.sourceDocument.originalName,
          pages: `${a.pageStart}-${a.pageEnd}`,
          checks_for_reviewer: openChecks(a.flags),
          extracted: data,
          transcription: full_text.length > 12000 ? `${full_text.slice(0, 12000)}… [truncated]` : full_text,
        },
        summary: `${a.typeLabel}${a.university ? ` · ${a.university.name}` : ""}`,
      };
    },
  }),

  scholarship_summary: tool({
    description: "Scholarship tiers and valuations from Scholarship Transfer and Valuation Letters, optionally for one university or academic year. Values are returned as printed plus the parsed number.",
    input_schema: {
      type: "object",
      properties: { university: { type: "string" }, academic_year: { type: "string", description: "e.g. 2025-26" } },
      required: [],
    },
    schema: z.object({ university: z.string().optional(), academic_year: z.string().optional() }),
    label: (i) => `Collecting scholarship figures${i.university ? ` for ${i.university}` : ""}`,
    run: async ({ university, academic_year }) => {
      const ids = await universityIds(university);
      const rows = await db.agreement.findMany({
        where: {
          type: { in: ["scholarship_valuation_letter", "scholarship_transfer_letter"] },
          ...(ids ? { universityId: { in: ids } } : {}),
          ...(academic_year ? { academicYear: { contains: academic_year.slice(0, 4) } } : {}),
        },
        include: agreementInclude,
        orderBy: { agreementDate: "desc" },
      });
      const result = rows.map((a) => {
        const d = a.data as unknown as ExtractedDocument;
        return {
          ...brief(a),
          tiers: d.scholarship_tiers.map((t) => ({
            name: t.name,
            quantity_as_printed: t.quantity_text,
            quantity: t.quantity,
            value_per_year_as_printed: t.value_per_scholarship_per_year_text,
            total_annual_as_printed: t.total_annual_value_text,
            total_multi_year_as_printed: t.total_multi_year_value_text,
            page: t.page,
          })),
          totals: d.scholarship_totals,
          checks_for_reviewer: openChecks(a.flags),
        };
      });
      return { result, summary: `Found ${rows.length} scholarship letter${rows.length === 1 ? "" : "s"}` };
    },
  }),

  find_missing_agreements: tool({
    description: "For each university (or one university), which standard agreement types are NOT on file yet. Useful for finding gaps in the paperwork.",
    input_schema: { type: "object", properties: { university: { type: "string" } }, required: [] },
    schema: z.object({ university: z.string().optional() }),
    label: (i) => `Checking for missing agreement types${i.university ? ` at ${i.university}` : ""}`,
    run: async ({ university }) => {
      const ids = await universityIds(university);
      const unis = await db.university.findMany({ where: ids ? { id: { in: ids } } : undefined, include: { agreements: { select: { type: true } } }, take: 200 });
      const standard = Object.entries(DOCUMENT_TYPES).filter(([k]) => k !== "other");
      const result = unis.map((u) => {
        const have = new Set(u.agreements.map((a) => a.type));
        return { university: u.name, university_id: u.id, missing: standard.filter(([k]) => !have.has(k)).map(([, v]) => v) };
      });
      return { result, summary: `Checked ${result.length} universit${result.length === 1 ? "y" : "ies"}` };
    },
  }),

  list_expiring: tool({
    description: "Agreements whose calculated term end falls within the next N days (and optionally ones already ended). End dates are calculated from the printed date plus term, not printed on the document.",
    input_schema: {
      type: "object",
      properties: { within_days: { type: "integer", description: "Look-ahead window, default 365" }, include_expired: { type: "boolean" } },
      required: [],
    },
    schema: z.object({ within_days: z.number().int().optional(), include_expired: z.boolean().optional() }),
    label: (i) => `Checking terms ending within ${i.within_days ?? 365} days`,
    run: async ({ within_days = 365, include_expired = false }) => {
      const until = new Date(Date.now() + within_days * 86_400_000);
      const rows = await db.agreement.findMany({
        where: { expiryDate: { not: null, lte: until, ...(include_expired ? {} : { gte: new Date() }) } },
        include: agreementInclude,
        orderBy: { expiryDate: "asc" },
      });
      return { result: rows.map((a) => ({ ...brief(a), auto_renews: a.autoRenewal })), summary: `${rows.length} term${rows.length === 1 ? "" : "s"} ending` };
    },
  }),

  search_text: tool({
    description: "Full-text search of every agreement's transcription for a word, phrase or printed number (e.g. 'rollover', '37500', 'profit'). Returns matching excerpts.",
    input_schema: { type: "object", properties: { phrase: { type: "string" } }, required: ["phrase"] },
    schema: z.object({ phrase: z.string().min(1) }),
    label: (i) => `Searching all transcriptions for “${i.phrase}”`,
    run: async ({ phrase }) => {
      const rows = await db.agreement.findMany({ where: { fullText: { contains: phrase } }, include: agreementInclude, take: 25 });
      const result = rows.map((a) => {
        const i = a.fullText.toLowerCase().indexOf(phrase.toLowerCase());
        return { ...brief(a), excerpt: a.fullText.slice(Math.max(0, i - 200), i + phrase.length + 200) };
      });
      return { result, summary: `${rows.length} match${rows.length === 1 ? "" : "es"}` };
    },
  }),
};

export type ToolName = keyof typeof TOOLS;

export const TOOL_DEFINITIONS: Anthropic.Tool[] = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  input_schema: t.input_schema,
  // Streamed requests with client tools stream inputs eagerly; inputs are validated before running.
  eager_input_streaming: true,
}));

export function isToolName(name: string): name is ToolName {
  return name in TOOLS;
}
