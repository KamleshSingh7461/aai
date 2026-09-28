import { ChevronRight } from "lucide-react";
import Link from "next/link";

const tones = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-rose-200 bg-rose-50 text-rose-800",
  blue: "border-brand-200 bg-brand-50 text-brand-700",
  gray: "border-line bg-slate-50 text-slate-600",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[12px] font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return status === "approved" ? <Badge tone="green">Approved</Badge> : <Badge tone="amber">Awaiting review</Badge>;
}

export function CompanyTag({ code }: { code: string | null | undefined }) {
  if (!code) return <Badge tone="amber">Unassigned</Badge>;
  return <span className="inline-flex items-center rounded border border-line-strong bg-white px-1.5 py-px font-mono text-[11px] font-medium tracking-wide text-slate-700">{code}</span>;
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ crumbs, className = "mb-1.5" }: { crumbs: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex flex-wrap items-center gap-1 text-[13px] text-slate-500 ${className}`}>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          {c.href ? <Link href={c.href} className="hover:text-slate-900 hover:underline">{c.label}</Link> : <span className="max-w-[40ch] truncate text-slate-700">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({ title, description, crumbs, actions }: { title: React.ReactNode; description?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 border-b border-line pb-5">
      {crumbs && crumbs.length > 0 && <Breadcrumbs crumbs={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-slate-900">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-[14px] text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
      <h2 className="text-[14px] font-semibold text-slate-900">{children}</h2>
      {action}
    </div>
  );
}

/** Two-column label/value list used on detail pages. */
export function Facts({ items, className = "" }: { items: [string, React.ReactNode][]; className?: string }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 ${className}`}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-[14px] text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
