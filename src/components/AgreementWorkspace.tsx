"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExtractedDocument, Flag } from "@/lib/extraction/schema";
import { DOCUMENT_TYPES } from "@/lib/extraction/types";
import { useToast } from "./Toaster";

type Option = { id: string; name: string; code?: string };

type Props = {
  agreement: {
    id: string;
    status: string;
    universityId: string | null;
    companyId: string | null;
    pageStart: number;
    pageEnd: number;
    fileUrl: string;
    data: ExtractedDocument;
    flags: Flag[];
    expiryDate: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  };
  universities: Option[];
  companies: Option[];
};

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function AgreementWorkspace({ agreement, universities: initialUniversities, companies: initialCompanies }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<ExtractedDocument>(agreement.data);
  const [universityId, setUniversityId] = useState(agreement.universityId ?? "");
  const [companyId, setCompanyId] = useState(agreement.companyId ?? "");
  const [universities, setUniversities] = useState(initialUniversities);
  const [companies, setCompanies] = useState(initialCompanies);
  const [flags, setFlags] = useState(agreement.flags);
  const [editing, setEditing] = useState(agreement.status !== "approved");
  const [page, setPage] = useState(agreement.pageStart);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showText, setShowText] = useState(false);
  const [newUniversity, setNewUniversity] = useState<{ name: string; address: string } | null>(null);
  const [newCompany, setNewCompany] = useState<{ name: string; code: string; isGroup: boolean } | null>(null);

  /** Immutable update at a dotted path, e.g. "scholarship_tiers.0.quantity". */
  function update(path: string, value: unknown) {
    setDirty(true);
    setData((prev) => {
      const next = structuredClone(prev) as Record<string, unknown>;
      const keys = path.split(".");
      let obj: Record<string, unknown> = next;
      for (const k of keys.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
      obj[keys[keys.length - 1]] = value;
      return next as ExtractedDocument;
    });
  }

  async function save(action: "save" | "approve") {
    setBusy(action);
    const res = await fetch(`/api/agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, universityId, companyId, action }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast({ tone: "error", title: "Not saved", body: body.error ?? "Please try again." });
      return;
    }
    setFlags(body.flags);
    setDirty(false);
    if (action === "approve") {
      setEditing(false);
      toast({ tone: "success", title: "Agreement approved", body: "This record is now the official version." });
    } else {
      toast({ tone: "success", title: "Changes saved", body: "Checks were re-run on your edits." });
    }
    router.refresh();
  }

  async function createUniversity() {
    if (!newUniversity?.name.trim()) return;
    const printed = data.university?.name;
    const res = await fetch("/api/universities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newUniversity, aliases: printed && printed !== newUniversity.name ? [printed] : [] }),
    });
    const body = await res.json();
    if (!res.ok) return toast({ tone: "error", title: "University not created", body: body.error });
    setUniversities((list) => [...list, { id: body.id, name: body.name }].sort((a, b) => a.name.localeCompare(b.name)));
    setUniversityId(body.id);
    setNewUniversity(null);
    setDirty(true);
    toast({ tone: "success", title: "University added", body: body.name });
  }

  async function createCompany() {
    if (!newCompany?.name.trim() || !newCompany.code.trim()) return;
    const printed = data.company?.name;
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newCompany, aliases: printed && printed !== newCompany.name ? [printed] : [] }),
    });
    const body = await res.json();
    if (!res.ok) return toast({ tone: "error", title: "Company not created", body: body.error });
    setCompanies((list) => [...list, { id: body.id, name: body.name, code: body.code }]);
    setCompanyId(body.id);
    setNewCompany(null);
    setDirty(true);
    toast({ tone: "success", title: "Company added", body: `${body.code} — ${body.name}` });
  }

  const warnings = flags.filter((f) => f.severity === "warning");
  const infos = flags.filter((f) => f.severity === "info");
  const pages = Array.from({ length: agreement.pageEnd - agreement.pageStart + 1 }, (_, i) => agreement.pageStart + i);
  const approved = agreement.status === "approved";

  const PageLink = ({ n }: { n: number | null | undefined }) =>
    n ? (
      <button type="button" onClick={() => setPage(n)} title={`Show page ${n} of the scan`} className={`ml-1.5 text-[12px] tabular-nums underline-offset-2 hover:underline ${page === n ? "font-medium text-brand-600" : "text-slate-500"}`}>
        p.{n}
      </button>
    ) : null;

  return (
    <div className="space-y-4">
      {/* Review status and actions */}
      <div className="sticky top-14 z-10 -mx-4 border-y border-line bg-white/95 px-4 py-2.5 backdrop-blur-sm sm:mx-0 sm:rounded-md sm:border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 text-[13px]">
            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${approved ? "bg-emerald-600" : "bg-amber-500"}`} />
            <span className="font-medium text-slate-900">{approved ? "Approved" : "Awaiting review"}</span>
            <span className="text-slate-500">
              {approved
                ? ` · by ${agreement.reviewedBy ?? "reviewer"}${agreement.reviewedAt ? ` on ${dateFmt(agreement.reviewedAt)}` : ""}`
                : ` · ${warnings.length} check${warnings.length === 1 ? "" : "s"} to confirm`}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-[12px] text-amber-700">Unsaved changes</span>}
            {editing ? (
              <>
                <button className="btn-secondary" disabled={!!busy} onClick={() => save("save")}>
                  {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}Save draft
                </button>
                <button className="btn-success" disabled={!!busy} onClick={() => save("approve")}>
                  {busy === "approve" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {approved ? "Save changes" : "Approve"}
                </button>
              </>
            ) : (
              <button className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Signed copy */}
        <div className="card flex flex-col overflow-hidden xl:sticky xl:top-[7.75rem] xl:h-[calc(100vh-9rem)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[13px]">
            <span className="font-medium text-slate-900">Signed copy</span>
            <span className="text-slate-400">Page</span>
            <div className="flex gap-1">
              {pages.map((n) => (
                <button key={n} onClick={() => setPage(n)} className={`h-7 min-w-7 rounded border px-1.5 text-[12px] tabular-nums ${page === n ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-white text-slate-700 hover:bg-slate-50"}`}>
                  {n}
                </button>
              ))}
            </div>
            <a href={agreement.fileUrl} target="_blank" className="ml-auto text-brand-600 hover:underline">Open original</a>
          </div>
          <iframe key={page} src={`${agreement.fileUrl}#page=${page}&view=FitH`} className="h-[75vh] w-full bg-slate-100 xl:h-auto xl:flex-1" title="Signed copy of the agreement" />
        </div>

        {/* Extracted record */}
        <div className="space-y-4">
          {(warnings.length > 0 || infos.length > 0) && (
            <Card title="Checks for the reviewer" note="Reported only. Change a value only if it was read wrongly from the scan.">
              <ul className="space-y-2 text-[13px]">
                {warnings.map((f, i) => (
                  <li key={`w${i}`} className="border-l-2 border-rose-500 bg-rose-50/60 py-1.5 pr-2 pl-3 text-slate-900">{f.message}<PageLink n={f.page} /></li>
                ))}
                {infos.map((f, i) => (
                  <li key={`i${i}`} className="border-l-2 border-line-strong py-1.5 pr-2 pl-3 text-slate-600">{f.message}<PageLink n={f.page} /></li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Filed under">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">University</label>
                <select className="input" value={universityId} disabled={!editing} onChange={(e) => { setUniversityId(e.target.value); setDirty(true); }}>
                  <option value="">Not assigned</option>
                  {universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <Printed value={data.university?.name} />
                {editing && !universityId && !newUniversity && (
                  <button type="button" onClick={() => setNewUniversity({ name: data.university?.name ?? "", address: data.university?.address ?? "" })} className="mt-1.5 text-[13px] text-brand-600 hover:underline">
                    Add as a new university
                  </button>
                )}
                {newUniversity && (
                  <InlineForm onCreate={createUniversity} onCancel={() => setNewUniversity(null)}>
                    <input className="input" placeholder="University name" value={newUniversity.name} onChange={(e) => setNewUniversity({ ...newUniversity, name: e.target.value })} />
                    <input className="input" placeholder="Address" value={newUniversity.address} onChange={(e) => setNewUniversity({ ...newUniversity, address: e.target.value })} />
                  </InlineForm>
                )}
              </div>
              <div>
                <label className="label">Company</label>
                <select className="input" value={companyId} disabled={!editing} onChange={(e) => { setCompanyId(e.target.value); setDirty(true); }}>
                  <option value="">Not assigned</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
                <Printed value={data.company?.name} />
                {editing && !companyId && !newCompany && (
                  <button type="button" onClick={() => setNewCompany({ name: data.company?.name ?? "", code: "", isGroup: true })} className="mt-1.5 text-[13px] text-brand-600 hover:underline">
                    Add as a new company
                  </button>
                )}
                {newCompany && (
                  <InlineForm onCreate={createCompany} onCancel={() => setNewCompany(null)}>
                    <input className="input" placeholder="Company name" value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} />
                    <input className="input" placeholder="Short code, e.g. TEAMFIBRE" value={newCompany.code} onChange={(e) => setNewCompany({ ...newCompany, code: e.target.value.toUpperCase() })} />
                    <label className="flex items-center gap-2 text-[13px] text-slate-700">
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={newCompany.isGroup} onChange={(e) => setNewCompany({ ...newCompany, isGroup: e.target.checked })} />
                      One of our group companies
                    </label>
                  </InlineForm>
                )}
              </div>
            </div>
            {data.other_parties.length > 0 && (
              <p className="mt-4 text-[13px] text-slate-600">
                <span className="text-slate-500">Other parties: </span>
                {data.other_parties.map((p) => `${p.name} (${p.role})`).join("; ")}
              </p>
            )}
          </Card>

          <Card title="Key terms">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Document type</label>
                <select className="input" value={data.document_type} disabled={!editing} onChange={(e) => update("document_type", e.target.value)}>
                  {Object.entries(DOCUMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <Field wide label="Title" value={data.title} editing={editing} onChange={(v) => update("title", v)} />
              <Field label="Date as printed" value={data.document_date_text} editing={editing} onChange={(v) => update("document_date_text", v)} />
              <Field label="Date (YYYY-MM-DD)" value={data.document_date_iso} editing={editing} onChange={(v) => update("document_date_iso", v)} mono />
              <Field label="Academic year" value={data.academic_year} editing={editing} onChange={(v) => update("academic_year", v)} />
              <NumberField label="Term in years" value={data.term_years} editing={editing} onChange={(v) => update("term_years", v)} />
              <Field wide label="Term as printed" value={data.term_text} editing={editing} onChange={(v) => update("term_text", v)} multiline />
              <div>
                <label className="label">Auto-renews</label>
                <select className="input" disabled={!editing} value={data.auto_renewal == null ? "" : String(data.auto_renewal)} onChange={(e) => update("auto_renewal", e.target.value === "" ? null : e.target.value === "true")}>
                  <option value="">Not stated</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <Field label="Notice period" value={data.notice_period_text} editing={editing} onChange={(v) => update("notice_period_text", v)} />
              <div className="sm:col-span-2">
                <span className="label">Term ends (calculated from date and term)</span>
                <p className="tabular-nums text-slate-900">{agreement.expiryDate ? dateFmt(agreement.expiryDate) : "—"}</p>
              </div>
            </div>
            {data.referenced_agreement && (
              <p className="mt-4 border-t border-line pt-3 text-[13px] text-slate-700">
                <span className="text-slate-500">Refers to: </span>“{data.referenced_agreement.text}”
                {data.referenced_agreement.section && <span className="text-slate-500">, section {data.referenced_agreement.section}</span>}
              </p>
            )}
          </Card>

          {data.scholarship_tiers.length > 0 && (
            <Card title="Scholarships">
              <div className="space-y-5">
                {data.scholarship_tiers.map((t, i) => (
                  <div key={i} className={i > 0 ? "border-t border-line pt-5" : ""}>
                    <div className="mb-3 flex items-center gap-2">
                      {editing ? (
                        <input className="input" value={t.name} onChange={(e) => update(`scholarship_tiers.${i}.name`, e.target.value)} />
                      ) : (
                        <h3 className="text-[14px] font-semibold text-slate-900">{t.name}</h3>
                      )}
                      <PageLink n={t.page} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <PrintedAmount label="Quantity" base={`scholarship_tiers.${i}.quantity`} text={t.quantity_text} value={t.quantity} editing={editing} update={update} integer />
                      <Field label="Duration" value={t.duration_text} editing={editing} onChange={(v) => update(`scholarship_tiers.${i}.duration_text`, v)} />
                      <PrintedAmount label="Value per scholarship per year" base={`scholarship_tiers.${i}.value_per_scholarship_per_year`} text={t.value_per_scholarship_per_year_text} value={t.value_per_scholarship_per_year} editing={editing} update={update} />
                      <PrintedAmount label="Total annual value" base={`scholarship_tiers.${i}.total_annual_value`} text={t.total_annual_value_text} value={t.total_annual_value} editing={editing} update={update} />
                      <PrintedAmount label="Total multi-year value" base={`scholarship_tiers.${i}.total_multi_year_value`} text={t.total_multi_year_value_text} value={t.total_multi_year_value} editing={editing} update={update} />
                    </div>
                    {t.inclusions.length > 0 && (
                      <table className="mt-4 w-full text-[13px]">
                        <thead className="border-y border-line bg-slate-50"><tr><th className="th px-3">Includes</th><th className="th px-3 text-right">As printed</th></tr></thead>
                        <tbody className="divide-y divide-line">
                          {t.inclusions.map((inc, j) => (
                            <tr key={j}><td className="px-3 py-1.5 text-slate-700">{inc.item}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{inc.value_text}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {data.scholarship_totals && (
            <Card title="Total valuation" note={`Currency as printed: ${data.scholarship_totals.currency_as_printed ?? "none"}`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <PrintedAmount large label="Combined annual value" base="scholarship_totals.combined_annual_value" text={data.scholarship_totals.combined_annual_value_text} value={data.scholarship_totals.combined_annual_value} editing={editing} update={update} />
                <PrintedAmount large label="Combined multi-year value" base="scholarship_totals.combined_multi_year_value" text={data.scholarship_totals.combined_multi_year_value_text} value={data.scholarship_totals.combined_multi_year_value} editing={editing} update={update} />
              </div>
              <p className="mt-2 text-[12px] text-slate-500">Source<PageLink n={data.scholarship_totals.page} /></p>
            </Card>
          )}

          {data.financial_terms.length > 0 && (
            <Card title="Financial terms">
              <FieldList base="financial_terms" items={data.financial_terms} editing={editing} update={update} PageLink={PageLink} />
            </Card>
          )}

          {data.key_fields.length > 0 && (
            <Card title="Clauses and other terms">
              <FieldList base="key_fields" items={data.key_fields} editing={editing} update={update} PageLink={PageLink} />
            </Card>
          )}

          {data.obligations.length > 0 && (
            <Card title="Obligations and deadlines">
              <table className="w-full text-[13px]">
                <thead className="border-b border-line"><tr><th className="th px-0">Party</th><th className="th">Obligation</th><th className="th">Deadline</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.obligations.map((o, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 align-top font-medium text-slate-900">{o.party}</td>
                      <td className="px-4 py-2 align-top text-slate-700">{o.obligation}<PageLink n={o.page} /></td>
                      <td className="px-4 py-2 align-top text-slate-700">{o.deadline_text ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <Card title="Signatures and stamps">
            <ul className="space-y-2 text-[13px]">
              {data.signatories.map((s, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-900">{s.name ?? "Name not legible"}</span>
                  {s.handwritten && <span className="text-slate-500"> (handwritten)</span>}
                  <span className="text-slate-600">{[s.designation, s.organisation].filter(Boolean).map((x) => `, ${x}`).join("")}</span>
                  <PageLink n={s.page} />
                </li>
              ))}
              {data.signatories.length === 0 && <li className="text-slate-500">No signatures found on these pages.</li>}
            </ul>
            {data.stamps.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[13px] text-slate-600">
                {data.stamps.map((s, i) => (
                  <li key={i}>Stamp: “{s.text}”<PageLink n={s.page} /></li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Summary">
            {editing ? (
              <textarea className="input h-auto min-h-24 py-2" value={data.summary} onChange={(e) => update("summary", e.target.value)} />
            ) : (
              <p className="text-[14px] leading-relaxed text-slate-700">{data.summary}</p>
            )}
            <button type="button" onClick={() => setShowText((s) => !s)} className="mt-3 text-[13px] text-brand-600 hover:underline">
              {showText ? "Hide" : "Show"} full transcription
            </button>
            {showText && (
              <pre className="mt-2 max-h-[60vh] overflow-auto rounded border border-line bg-slate-50 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-slate-700">{data.full_text}</pre>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
        {note && <span className="text-[12px] text-slate-500">{note}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Printed({ value }: { value: string | null | undefined }) {
  return <p className="mt-1 text-[12px] text-slate-500">On the document: {value ?? "not found"}</p>;
}

function InlineForm({ children, onCreate, onCancel }: { children: React.ReactNode; onCreate: () => void; onCancel: () => void }) {
  return (
    <div className="mt-2 space-y-2 rounded-md border border-line bg-slate-50 p-3">
      {children}
      <div className="flex gap-2 pt-1">
        <button type="button" className="btn-primary" onClick={onCreate}>Create</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, value, editing, onChange, wide, mono, multiline }: { label: string; value: string | null; editing: boolean; onChange: (v: string | null) => void; wide?: boolean; mono?: boolean; multiline?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <label className="label">{label}</label>
      {editing ? (
        multiline ? (
          <textarea className="input h-auto min-h-16 py-2" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />
        ) : (
          <input className={`input ${mono ? "font-mono" : ""}`} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />
        )
      ) : (
        <p className={`text-[14px] text-slate-900 ${mono ? "font-mono" : ""}`}>{value ?? <span className="text-slate-400">Not stated</span>}</p>
      )}
    </div>
  );
}

function NumberField({ label, value, editing, onChange }: { label: string; value: number | null; editing: boolean; onChange: (v: number | null) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      {editing ? (
        <input className="input tabular-nums" inputMode="numeric" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Math.trunc(Number(e.target.value)) || null)} />
      ) : (
        <p className="text-[14px] tabular-nums text-slate-900">{value ?? <span className="text-slate-400">Not stated</span>}</p>
      )}
    </div>
  );
}

/** A printed amount: edits change the printed text; the number is re-derived from its digits. */
function PrintedAmount({ label, base, text, value, editing, update, integer, large }: { label: string; base: string; text: string | null; value: number | null; editing: boolean; update: (p: string, v: unknown) => void; integer?: boolean; large?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      {editing ? (
        <input
          className="input tabular-nums"
          value={text ?? ""}
          onChange={(e) => {
            const t = e.target.value;
            update(`${base}_text`, t === "" ? null : t);
            const digits = t.replace(/\/-\s*$/, "").replace(/[^\d.]/g, "");
            const n = digits ? Number(digits) : null;
            update(base, n == null || !Number.isFinite(n) ? null : integer ? Math.trunc(n) : n);
          }}
        />
      ) : (
        <p className={`tabular-nums text-slate-900 ${large ? "text-[20px] font-semibold" : "text-[14px] font-medium"}`}>{text ?? <span className="text-[14px] font-normal text-slate-400">Not stated</span>}</p>
      )}
      {value != null && <p className="mt-0.5 text-[12px] tabular-nums text-slate-500">Read as {value.toLocaleString("en-IN")}</p>}
    </div>
  );
}

function FieldList({ base, items, editing, update, PageLink }: { base: string; items: ExtractedDocument["key_fields"]; editing: boolean; update: (p: string, v: unknown) => void; PageLink: (p: { n: number | null | undefined }) => React.ReactNode }) {
  return (
    <dl className="divide-y divide-line">
      {items.map((f, i) => (
        <div key={i} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[35%_65%] sm:gap-4">
          <dt className="text-[13px] text-slate-600">
            {f.label}
            {(f.handwritten || f.confidence !== "high") && (
              <span className="block text-[12px] text-amber-700">{[f.handwritten && "handwritten", f.confidence !== "high" && `${f.confidence} confidence`].filter(Boolean).join(", ")}</span>
            )}
          </dt>
          <dd className="text-[14px] text-slate-900">
            {editing ? <textarea className="input h-auto min-h-9 py-1.5" rows={Math.min(4, Math.ceil(f.value.length / 60))} value={f.value} onChange={(e) => update(`${base}.${i}.value`, e.target.value)} /> : <span className="leading-relaxed">{f.value}</span>}
            <PageLink n={f.page} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
