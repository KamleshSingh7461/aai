import type { Metadata } from "next";
import Link from "next/link";
import { Badge, CompanyTag, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { db } from "@/lib/db";
import { expiryState, flagCount, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const soon = new Date(Date.now() + 365 * 86_400_000);
  const [universityCount, agreements, companies, renewals, activity] = await Promise.all([
    db.university.count(),
    db.agreement.findMany({
      select: { id: true, status: true, flags: true, typeLabel: true, agreementDateText: true, companyId: true, university: { select: { name: true } }, company: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.company.findMany({ orderBy: [{ isGroup: "desc" }, { code: "asc" }] }),
    db.agreement.findMany({
      where: { expiryDate: { not: null, lte: soon } },
      include: { university: { select: { name: true } }, company: { select: { code: true } } },
      orderBy: { expiryDate: "asc" },
      take: 8,
    }),
    db.auditLog.findMany({
      // Field-level edits are in each agreement's history; this shows milestones.
      where: { action: { not: "edited" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { agreement: { select: { id: true, typeLabel: true, university: { select: { name: true } } } } },
    }),
  ]);

  const approved = agreements.filter((a) => a.status === "approved").length;
  const pending = agreements.filter((a) => a.status === "needs_review");
  const openChecks = pending.reduce((n, a) => n + flagCount(a.flags).warnings, 0);
  const byCompany = companies.map((c) => {
    const rows = agreements.filter((a) => a.companyId === c.id);
    return { ...c, total: rows.length, approved: rows.filter((a) => a.status === "approved").length };
  });
  const unassigned = agreements.filter((a) => !a.companyId).length;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Status of all agreements between partner universities and EUSAI group companies."
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-4">
        <Stat label="Partner universities" value={universityCount} href="/universities" />
        <Stat label="Agreements on record" value={agreements.length} href="/documents" />
        <Stat label="Approved" value={approved} note={agreements.length ? `${Math.round((approved / agreements.length) * 100)}% of records` : undefined} />
        <Stat label="Awaiting review" value={pending.length} href="/review" note={`${openChecks} open check${openChecks === 1 ? "" : "s"}`} />
      </dl>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card xl:col-span-2">
          <SectionTitle action={<Link href="/review" className="text-[13px] text-brand-600 hover:underline">View queue</Link>}>Awaiting review</SectionTitle>
          {pending.length === 0 ? (
            <EmptyState title="Nothing awaiting review" />
          ) : (
            <table className="w-full text-[14px]">
              <thead className="border-b border-line"><tr><th className="th">Agreement</th><th className="th">University</th><th className="th">Company</th><th className="th text-right">Open checks</th></tr></thead>
              <tbody className="divide-y divide-line">
                {pending.slice(0, 8).map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="td"><Link href={`/agreements/${a.id}`} className="font-medium text-brand-600 hover:underline">{a.typeLabel}</Link><div className="text-[12px] text-slate-500">{a.agreementDateText ?? "Undated"}</div></td>
                    <td className="td text-slate-700">{a.university?.name ?? <span className="text-amber-700">Not assigned</span>}</td>
                    <td className="td"><CompanyTag code={a.company?.code} /></td>
                    <td className="td text-right tabular-nums">{flagCount(a.flags).warnings || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <SectionTitle>By company</SectionTitle>
          <table className="w-full text-[14px]">
            <thead className="border-b border-line"><tr><th className="th">Company</th><th className="th text-right">Agreements</th><th className="th text-right">Approved</th></tr></thead>
            <tbody className="divide-y divide-line">
              {byCompany.map((c) => (
                <tr key={c.id}>
                  <td className="td"><CompanyTag code={c.code} /><div className="mt-0.5 text-[12px] text-slate-500">{c.name}</div></td>
                  <td className="td text-right tabular-nums">{c.total}</td>
                  <td className="td text-right tabular-nums text-slate-600">{c.approved}</td>
                </tr>
              ))}
              {unassigned > 0 && (
                <tr><td className="td text-amber-700">Not assigned</td><td className="td text-right tabular-nums">{unassigned}</td><td className="td text-right">—</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card xl:col-span-2">
          <SectionTitle>Terms ending in the next 12 months</SectionTitle>
          {renewals.length === 0 ? (
            <EmptyState title="No terms ending in the next 12 months">End dates are calculated from each agreement&apos;s date and term.</EmptyState>
          ) : (
            <table className="w-full text-[14px]">
              <thead className="border-b border-line"><tr><th className="th">Agreement</th><th className="th">University</th><th className="th">Ends (calculated)</th></tr></thead>
              <tbody className="divide-y divide-line">
                {renewals.map((a) => {
                  const state = expiryState(a.expiryDate);
                  return (
                    <tr key={a.id}>
                      <td className="td"><Link href={`/agreements/${a.id}`} className="font-medium text-brand-600 hover:underline">{a.typeLabel}</Link></td>
                      <td className="td text-slate-700">{a.university?.name ?? "—"}</td>
                      <td className="td tabular-nums">{formatDate(a.expiryDate)} {state === "expired" ? <Badge tone="red">Ended</Badge> : state === "expiring" ? <Badge tone="amber">Within 6 months</Badge> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <SectionTitle>Recent activity</SectionTitle>
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((l) => (
                <li key={l.id} className="px-4 py-2.5 text-[13px]">
                  <Link href={`/agreements/${l.agreement.id}`} className="text-slate-900 hover:underline">{activityLabel(l.action)}: {l.agreement.typeLabel}</Link>
                  <div className="text-[12px] text-slate-500">{l.agreement.university?.name ?? "Unassigned"} · {l.user ?? "system"} · {formatDate(l.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function activityLabel(action: string) {
  return ({ extracted: "Read from scan", approved: "Approved", "assigned from same file": "Assigned" } as Record<string, string>)[action] ?? action;
}

function Stat({ label, value, note, href }: { label: string; value: number; note?: string; href?: string }) {
  const body = (
    <>
      <dt className="text-[13px] text-slate-500">{label}</dt>
      <dd className="mt-1 text-[26px] font-semibold tabular-nums text-slate-900">{value.toLocaleString("en-IN")}</dd>
      {note && <dd className="text-[12px] text-slate-500">{note}</dd>}
    </>
  );
  return href ? (
    <div className="bg-white"><Link href={href} className="block h-full px-5 py-4 hover:bg-slate-50">{body}</Link></div>
  ) : (
    <div className="bg-white px-5 py-4">{body}</div>
  );
}
