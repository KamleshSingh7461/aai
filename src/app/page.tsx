import type { Metadata } from "next";
import { AgentConsole } from "@/components/AgentConsole";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Vault Agent" };

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [universities, agreements, approved, scholarshipUni, anyUni, topCompany] = await Promise.all([
    db.university.count(),
    db.agreement.count(),
    db.agreement.count({ where: { status: "approved" } }),
    db.agreement.findFirst({ where: { type: { startsWith: "scholarship" }, universityId: { not: null } }, select: { university: { select: { name: true } } } }),
    db.university.findFirst({ orderBy: { updatedAt: "desc" }, select: { name: true } }),
    db.agreement.groupBy({ by: ["companyId"], where: { companyId: { not: null } }, _count: true, orderBy: { _count: { companyId: "desc" } }, take: 1 }),
  ]);
  const company = topCompany[0]?.companyId ? await db.company.findUnique({ where: { id: topCompany[0].companyId }, select: { code: true } }) : null;

  // Suggestions reference real names from the vault so every one of them has an answer.
  const suggestions: string[] = [
    scholarshipUni?.university ? `What scholarships has ${scholarshipUni.university.name} granted, and what are they worth?` : "Summarise all scholarship valuation letters on file.",
    anyUni ? `Give me a briefing on every agreement with ${anyUni.name}.` : "Give me an overview of the vault.",
    "Which agreements have open checks, and what exactly needs confirming?",
    "Which universities are missing a University Partnership Agreement or Sports Logo Contract?",
    "Which agreement terms end in the next 12 months, and do any auto-renew?",
    company ? `Summarise everything signed with ${company.code}, grouped by agreement type.` : "Search all agreements for rollover clauses.",
  ];

  return (
    <AgentConsole
      connected={Boolean(process.env.ANTHROPIC_API_KEY)}
      stats={{ universities, agreements, approved }}
      suggestions={suggestions}
      initialQuestion={q}
    />
  );
}
