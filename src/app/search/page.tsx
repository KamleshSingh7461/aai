import type { Metadata } from "next";
import Link from "next/link";
import { CompanyTag, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Search" };

function snippet(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, i - 90);
  return {
    before: (start > 0 ? "…" : "") + text.slice(start, i),
    match: text.slice(i, i + q.length),
    after: text.slice(i + q.length, i + q.length + 140) + "…",
  };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const [results, universities] = q
    ? await Promise.all([
        db.agreement.findMany({
          where: {
            OR: [
              { fullText: { contains: q } },
              { title: { contains: q } },
              { typeLabel: { contains: q } },
              { summary: { contains: q } },
              { university: { name: { contains: q } } },
              { company: { OR: [{ name: { contains: q } }, { code: { contains: q } }] } },
            ],
          },
          include: { university: true, company: true },
          take: 100,
          orderBy: { agreementDate: "desc" },
        }),
        db.university.findMany({ where: { name: { contains: q } }, take: 6 }),
      ])
    : [[], []];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Overview", href: "/overview" }, { label: "Search" }]}
        title="Search"
        description="Exact-text search across every agreement's transcription, titles, universities and companies. For questions, use the Vault Agent."
      />

      <form className="mb-6 flex max-w-2xl gap-2">
        <input name="q" defaultValue={q} placeholder="e.g. rollover, profit share, 37500" className="input" autoFocus />
        <button className="btn-primary">Search</button>
      </form>

      {q && universities.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[13px] font-medium text-slate-500">Universities</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
            {universities.map((u) => (
              <li key={u.id}><Link href={`/universities/${u.id}`} className="text-brand-600 hover:underline">{u.name}</Link></li>
            ))}
          </ul>
        </section>
      )}

      {q && (
        <>
          <h2 className="mb-2 text-[13px] font-medium text-slate-500">{results.length} agreement{results.length === 1 ? "" : "s"} matching “{q}”</h2>
          <div className="card overflow-hidden">
            {results.length === 0 ? (
              <EmptyState title="No matches">Try a shorter phrase, or the number as printed (for example 37500 or 4,40,000).</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {results.map((a) => {
                  const s = snippet(a.fullText, q);
                  return (
                    <li key={a.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/agreements/${a.id}`} className="font-medium text-brand-600 hover:underline">{a.typeLabel}</Link>
                        <CompanyTag code={a.company?.code} />
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="text-[12px] text-slate-500">{a.university?.name ?? "University not assigned"} · {a.agreementDateText ?? "undated"}</div>
                      {s && (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                          {s.before}
                          <mark className="bg-amber-100 px-0.5 text-slate-900">{s.match}</mark>
                          {s.after}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
