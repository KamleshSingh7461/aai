import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, CompanyTag, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { expiryState, flagCount, formatDate } from "@/lib/format";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const u = await db.university.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: u?.name ?? "University" };
}

export default async function UniversityPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { company: companyFilter } = await searchParams;
  const university = await db.university.findUnique({
    where: { id },
    include: {
      agreements: {
        include: { company: true, sourceDocument: { select: { originalName: true } } },
        orderBy: [{ agreementDate: "desc" }, { createdAt: "desc" }],
      },
    },
  });
  if (!university) notFound();

  const groups = new Map<string, { code: string; name: string; items: typeof university.agreements }>();
  for (const a of university.agreements) {
    const code = a.company?.code ?? "";
    if (!groups.has(code)) groups.set(code, { code, name: a.company?.name ?? "Company not assigned", items: [] });
    groups.get(code)!.items.push(a);
  }
  const visible = [...groups.values()].filter((g) => companyFilter === undefined || g.code === companyFilter);
  const aliases = Array.isArray(university.aliases) ? (university.aliases as string[]) : [];
  const approved = university.agreements.filter((a) => a.status === "approved").length;
  const nextEnd = university.agreements
    .map((a) => a.expiryDate)
    .filter((d): d is Date => !!d && d.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const address = university.address || [university.city, university.state, university.pincode].filter(Boolean).join(", ") || "Address not recorded";
  const briefing = `Give me a briefing on every agreement with ${university.name}, including scholarships, terms and anything that needs checking.`;

  const tab = (active: boolean) =>
    `-mb-px border-b-2 px-1 pb-2.5 text-[13px] whitespace-nowrap ${active ? "border-brand-600 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Overview", href: "/overview" }, { label: "Universities", href: "/universities" }, { label: university.name }]}
        title={university.name}
        description={
          <>
            {address}
            {aliases.length > 0 && <span className="block text-[12px] text-slate-500">Also printed as: {aliases.join("; ")}</span>}
          </>
        }
        actions={
<Link href={`/?q=${encodeURIComponent(briefing)}`} className="btn-secondary">Ask the agent</Link>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        {[
          ["Agreements", String(university.agreements.length)],
          ["Approved", `${approved} of ${university.agreements.length}`],
          ["Group companies", String([...groups.keys()].filter(Boolean).length)],
          ["Next term ends", nextEnd ? formatDate(nextEnd) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-4 py-3">
            <dt className="text-[12px] text-slate-500">{k}</dt>
            <dd className="mt-0.5 text-[16px] font-semibold tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>

      <nav className="mb-5 flex gap-5 overflow-x-auto border-b border-line [scrollbar-width:none]">
        <Link href={`/universities/${id}`} className={tab(companyFilter === undefined)}>All ({university.agreements.length})</Link>
        {[...groups.values()].map((g) => (
          <Link key={g.code || "none"} href={`/universities/${id}?company=${g.code}`} className={tab(companyFilter === g.code)}>
            {g.code || "Unassigned"} ({g.items.length})
          </Link>
        ))}
      </nav>

      {visible.length === 0 && (
        <div className="card"><EmptyState title="No agreements on file" action={<Link href="/upload" className="btn-primary">Add an agreement</Link>} /></div>
      )}

      <div className="space-y-6">
        {visible.map((g) => (
          <section key={g.code || "none"} className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <CompanyTag code={g.code || null} />
              <h2 className="text-[14px] font-semibold text-slate-900">{g.name}</h2>
              <span className="text-[13px] text-slate-500">· {g.items.length} document{g.items.length === 1 ? "" : "s"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead className="border-b border-line bg-slate-50">
                  <tr><th className="th">Agreement</th><th className="th">Dated</th><th className="th">Academic year</th><th className="th">Term ends</th><th className="th">Checks</th><th className="th">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {g.items.map((a) => {
                    const flags = flagCount(a.flags);
                    const expiry = expiryState(a.expiryDate);
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="td max-w-md">
                          <Link href={`/agreements/${a.id}`} className="font-medium text-brand-600 hover:underline">{a.typeLabel}</Link>
                          <div className="line-clamp-1 text-[12px] text-slate-500">{a.title}</div>
                        </td>
                        <td className="td tabular-nums text-slate-700">{a.agreementDateText ?? "—"}</td>
                        <td className="td text-slate-700">{a.academicYear ?? "—"}</td>
                        <td className="td tabular-nums text-slate-700">
                          {formatDate(a.expiryDate)} {expiry === "expired" && <Badge tone="red">Ended</Badge>}{expiry === "expiring" && <Badge tone="amber">Soon</Badge>}
                        </td>
                        <td className="td">{flags.warnings > 0 ? <Badge tone="red">{flags.warnings} to confirm</Badge> : <span className="text-slate-400">None</span>}</td>
                        <td className="td"><StatusBadge status={a.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
