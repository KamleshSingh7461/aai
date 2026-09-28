import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgreementWorkspace } from "@/components/AgreementWorkspace";
import { CompanyTag, PageHeader, SectionTitle } from "@/components/ui";
import { db } from "@/lib/db";
import type { ExtractedDocument, Flag } from "@/lib/extraction/schema";
import { formatDate } from "@/lib/format";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const a = await db.agreement.findUnique({ where: { id: (await params).id }, select: { typeLabel: true } });
  return { title: a?.typeLabel ?? "Agreement" };
}

const actionLabel: Record<string, string> = {
  extracted: "Read from scan",
  approved: "Approved",
  edited: "Edited",
  "assigned from same file": "Assigned from the same file",
};

export default async function AgreementPage({ params }: Params) {
  const { id } = await params;
  const agreement = await db.agreement.findUnique({
    where: { id },
    include: { university: true, company: true, sourceDocument: true, auditLogs: { orderBy: { createdAt: "desc" } } },
  });
  if (!agreement) notFound();

  const [universities, companies, siblings] = await Promise.all([
    db.university.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.company.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.agreement.findMany({
      where: { sourceDocumentId: agreement.sourceDocumentId, id: { not: id } },
      select: { id: true, typeLabel: true, pageStart: true, pageEnd: true },
    }),
  ]);

  const askAgent = `Explain the ${agreement.typeLabel} (id ${agreement.id})${agreement.university ? ` with ${agreement.university.name}` : ""} in plain terms, and check it against that university's other agreements for anything inconsistent.`;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Overview", href: "/overview" },
          agreement.university ? { label: agreement.university.name, href: `/universities/${agreement.university.id}` } : { label: "Review queue", href: "/review" },
          { label: agreement.typeLabel },
        ]}
        title={agreement.typeLabel}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CompanyTag code={agreement.company?.code} />
            <span>{agreement.university?.name ?? "University not assigned"}</span>
            <span className="text-slate-300">|</span>
            <span>{agreement.agreementDateText ?? "Undated"}</span>
            <span className="text-slate-300">|</span>
            <span>{agreement.sourceDocument.originalName}, pages {agreement.pageStart}–{agreement.pageEnd}</span>
          </span>
        }
        actions={<Link href={`/?q=${encodeURIComponent(askAgent)}`} className="btn-secondary">Ask the agent</Link>}
      />

      {siblings.length > 0 && (
        <p className="mb-4 text-[13px] text-slate-600">
          The same scanned file also contains:{" "}
          {siblings.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ", "}
              <Link href={`/agreements/${s.id}`} className="text-brand-600 hover:underline">{s.typeLabel} (pages {s.pageStart}–{s.pageEnd})</Link>
            </span>
          ))}
        </p>
      )}

      <AgreementWorkspace
        key={agreement.updatedAt.toISOString()}
        agreement={{
          id: agreement.id,
          status: agreement.status,
          universityId: agreement.universityId,
          companyId: agreement.companyId,
          pageStart: agreement.pageStart,
          pageEnd: agreement.pageEnd,
          fileUrl: `/api/documents/${agreement.sourceDocumentId}/file`,
          data: agreement.data as unknown as ExtractedDocument,
          flags: agreement.flags as unknown as Flag[],
          expiryDate: agreement.expiryDate?.toISOString() ?? null,
          reviewedBy: agreement.reviewedBy,
          reviewedAt: agreement.reviewedAt?.toISOString() ?? null,
        }}
        universities={universities}
        companies={companies}
      />

      <section className="card mt-6 overflow-hidden">
        <SectionTitle>Record history</SectionTitle>
        <table className="w-full text-[13px]">
          <thead className="border-b border-line bg-slate-50"><tr><th className="th">When</th><th className="th">By</th><th className="th">Action</th><th className="th">Detail</th></tr></thead>
          <tbody className="divide-y divide-line">
            {agreement.auditLogs.map((l) => (
              <tr key={l.id}>
                <td className="td whitespace-nowrap tabular-nums text-slate-600">{formatDate(l.createdAt)} {l.createdAt.toISOString().slice(11, 16)} UTC</td>
                <td className="td text-slate-600">{l.user ?? "system"}</td>
                <td className="td text-slate-900">{actionLabel[l.action] ?? l.action}</td>
                <td className="td text-slate-600">
                  {l.field ? (
                    <>
                      <span className="font-mono text-[12px] text-slate-500">{l.field}</span>: <span className="line-through">{l.oldValue || "empty"}</span> → <span className="text-slate-900">{l.newValue || "empty"}</span>
                    </>
                  ) : (
                    l.newValue
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
