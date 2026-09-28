import type { Metadata } from "next";
import Link from "next/link";
import { Badge, CompanyTag, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Universities" };

export default async function UniversitiesPage({ searchParams }: { searchParams: Promise<{ company?: string; q?: string }> }) {
  const { company: companyFilter, q = "" } = await searchParams;
  const [universities, companies] = await Promise.all([
    db.university.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { city: { contains: q } }, { address: { contains: q } }] } : undefined,
      orderBy: { name: "asc" },
      include: { agreements: { select: { status: true, agreementDate: true, company: { select: { code: true } } } } },
    }),
    db.company.findMany({ orderBy: [{ isGroup: "desc" }, { code: "asc" }] }),
  ]);

  const rows = universities
    .map((u) => {
      const byCompany = new Map<string, number>();
      for (const a of u.agreements) byCompany.set(a.company?.code ?? "", (byCompany.get(a.company?.code ?? "") ?? 0) + 1);
      const latest = u.agreements.map((a) => a.agreementDate).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
      const approved = u.agreements.filter((a) => a.status === "approved").length;
      return { u, byCompany, latest, approved, pending: u.agreements.length - approved };
    })
    .filter((r) => !companyFilter || r.byCompany.has(companyFilter));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Overview", href: "/overview" }, { label: "Universities" }]}
        title="Universities"
        description="Partner universities and the agreements each holds with group companies."
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Filter by name or city" className="input w-full sm:w-72" />
        <select name="company" defaultValue={companyFilter ?? ""} className="input w-auto">
          <option value="">All companies</option>
          {companies.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-secondary">Apply</button>
        {(q || companyFilter) && <Link href="/universities" className="btn-ghost">Clear</Link>}
      </form>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title={universities.length === 0 && !q ? "No universities yet" : "No matching universities"}
            action={universities.length === 0 && !q ? <Link href="/upload" className="btn-primary">Add the first agreement</Link> : undefined}
          >
            {universities.length === 0 && !q ? "Universities are added from the documents during review." : "Try a different name or company."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="border-b border-line bg-slate-50">
                <tr><th className="th">University</th><th className="th">Agreements by company</th><th className="th">Latest agreement</th><th className="th">Review status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ u, byCompany, latest, approved, pending }) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/universities/${u.id}`} className="font-medium text-brand-600 hover:underline">{u.name}</Link>
                      <div className="text-[12px] text-slate-500">{[u.city, u.state].filter(Boolean).join(", ") || u.address || "Address not recorded"}</div>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-2">
                        {[...byCompany].map(([code, n]) => (
                          <span key={code} className="inline-flex items-center gap-1"><CompanyTag code={code || null} /><span className="text-[12px] tabular-nums text-slate-500">{n}</span></span>
                        ))}
                        {byCompany.size === 0 && <span className="text-slate-400">None</span>}
                      </div>
                    </td>
                    <td className="td tabular-nums text-slate-700">{formatDate(latest)}</td>
                    <td className="td">{pending > 0 ? <Badge tone="amber">{pending} awaiting review</Badge> : approved > 0 ? <Badge tone="green">All approved</Badge> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line bg-slate-50 px-4 py-2 text-[12px] text-slate-500">
          {rows.length} of {universities.length} universit{universities.length === 1 ? "y" : "ies"}
        </div>
      </div>
    </>
  );
}
