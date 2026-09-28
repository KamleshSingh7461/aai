import type { Metadata } from "next";
import Link from "next/link";
import { Badge, CompanyTag, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { flagCount, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Review queue" };

export default async function ReviewPage() {
  const items = await db.agreement.findMany({
    where: { status: "needs_review" },
    include: { university: true, company: true, sourceDocument: { select: { originalName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const unassigned = items.filter((a) => !a.universityId || !a.companyId).length;
  const flagged = items.filter((a) => flagCount(a.flags).warnings > 0).length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Overview", href: "/overview" }, { label: "Review queue" }]}
        title="Review queue"
        description="Agreements read from scans, waiting to be checked against the signed copy. Only approved records are official."
      />

      <p className="mb-4 text-[13px] text-slate-600">
        {items.length} awaiting review · {flagged} with checks to confirm · {unassigned} missing a university or company
      </p>

      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="Nothing awaiting review">Every agreement on record has been approved.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="border-b border-line bg-slate-50">
                <tr><th className="th">Agreement</th><th className="th">University</th><th className="th">Company</th><th className="th">Dated</th><th className="th">Checks</th><th className="th">Received</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((a) => {
                  const flags = flagCount(a.flags);
                  const printed = (a.data as { university?: { name?: string } | null }).university?.name;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="td">
                        <Link href={`/agreements/${a.id}`} className="font-medium text-brand-600 hover:underline">{a.typeLabel}</Link>
                        <div className="max-w-[36ch] truncate text-[12px] text-slate-500">{a.sourceDocument.originalName}, pages {a.pageStart}–{a.pageEnd}</div>
                      </td>
                      <td className="td">{a.university ? <span className="text-slate-800">{a.university.name}</span> : <span className="text-amber-700">Not matched (printed: {printed ?? "none"})</span>}</td>
                      <td className="td"><CompanyTag code={a.company?.code} /></td>
                      <td className="td tabular-nums text-slate-700">{a.agreementDateText ?? "—"}</td>
                      <td className="td">{flags.warnings > 0 ? <Badge tone="red">{flags.warnings} to confirm</Badge> : <span className="text-slate-400">None</span>}</td>
                      <td className="td whitespace-nowrap text-slate-600">{formatDate(a.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
