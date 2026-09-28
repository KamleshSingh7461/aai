"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";

type Status = {
  id: string;
  status: "processing" | "done" | "failed";
  error: string | null;
  originalName: string;
  pageCount: number;
  updatedAt: string;
  agreements: { id: string; typeLabel: string; pageStart: number; pageEnd: number }[];
};

// The server only reports processing/done, so stage progress is an estimate based on elapsed time.
const STAGES = [
  { title: "Original stored", at: 0 },
  { title: "Reading pages", at: 4 },
  { title: "Recording terms", at: 35 },
  { title: "Running checks", at: 75 },
];

export default function DocumentStatusPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Status | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [connection, setConnection] = useState<"ok" | "retrying" | "missing">("ok");

  useEffect(() => {
    let stop = false;
    let timeout: ReturnType<typeof setTimeout>;
    // Keeps polling through network errors and server restarts instead of silently stopping.
    async function poll() {
      try {
        const res = await fetch(`/api/documents/${id}`, { cache: "no-store" });
        if (stop) return;
        if (res.status === 404) return setConnection("missing");
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const body: Status = await res.json();
        setDoc(body);
        setConnection("ok");
        if (body.status === "processing") timeout = setTimeout(poll, 3000);
      } catch {
        if (stop) return;
        setConnection("retrying");
        timeout = setTimeout(poll, 5000);
      }
    }
    poll();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearTimeout(timeout);
      clearInterval(timer);
    };
  }, [id]);

  useEffect(() => {
    if (doc?.status === "done" && doc.agreements.length === 1) {
      const t = setTimeout(() => router.replace(`/agreements/${doc.agreements[0].id}`), 1200);
      return () => clearTimeout(t);
    }
  }, [doc, router]);

  async function retry() {
    await fetch(`/api/documents/${id}/retry`, { method: "POST" });
    location.reload();
  }

  if (connection === "missing") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="File not found" description="It may have been removed." actions={<Link href="/documents" className="btn-secondary">Document archive</Link>} />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-7 w-2/3" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  const seconds = Math.max(0, Math.floor((now - new Date(doc.updatedAt).getTime()) / 1000));
  const current = doc.status === "done" ? STAGES.length : STAGES.filter((s) => seconds >= s.at).length - 1;
  const statusText = { processing: "Reading in progress", done: "Reading complete", failed: "Reading stopped" }[doc.status];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        crumbs={[{ label: "Document archive", href: "/documents" }, { label: doc.originalName }]}
        title={statusText}
        description={`${doc.originalName} · ${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}`}
      />

      {connection === "retrying" && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Cannot reach the app at the moment. Retrying automatically…</p>
      )}

      {doc.status !== "failed" && (
        <div className="card">
          <ol className="divide-y divide-line">
            {STAGES.map((s, i) => {
              const state = i < current ? "done" : i === current ? "active" : "todo";
              return (
                <li key={s.title} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                  <span className="grid h-5 w-5 place-items-center">
                    {state === "done" ? <Check className="h-4 w-4 text-emerald-700" /> : state === "active" ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : <span className="h-2 w-2 rounded-full bg-slate-300" />}
                  </span>
                  <span className={state === "todo" ? "text-slate-400" : "text-slate-900"}>{s.title}</span>
                </li>
              );
            })}
          </ol>
          {doc.status === "processing" && (
            <p className="border-t border-line px-4 py-3 text-[12px] text-slate-500">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} elapsed. Usually 1–3 minutes; stage timing is approximate. You can leave this page — the result goes to the review queue.
            </p>
          )}
        </div>
      )}

      {doc.status === "failed" && (
        <div className="card p-4">
          <p className="text-[14px] text-slate-900">{doc.error}</p>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={retry}>Try again</button>
            <a className="btn-secondary" href={`/api/documents/${doc.id}/file`} target="_blank">View original</a>
          </div>
        </div>
      )}

      {doc.status === "done" && (
        <div className="card mt-4">
          <div className="border-b border-line px-4 py-3 text-[14px] font-semibold text-slate-900">
            {doc.agreements.length} document{doc.agreements.length === 1 ? "" : "s"} found{doc.agreements.length === 1 ? " — opening for review" : ""}
          </div>
          <ul className="divide-y divide-line">
            {doc.agreements.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-3 text-[14px]">
                <span>{a.typeLabel} <span className="text-slate-500">(pages {a.pageStart}–{a.pageEnd})</span></span>
                <Link className="btn-secondary" href={`/agreements/${a.id}`}>Review</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
