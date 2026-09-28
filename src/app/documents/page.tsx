import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Document archive" };

export default async function DocumentsPage() {
  const docs = await db.sourceDocument.findMany({
    orderBy: { createdAt: "desc" },
    include: { agreements: { select: { id: true, typeLabel: true, status: true, university: { select: { name: true } } } } },
    take: 200,
  });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Overview", href: "/overview" }, { label: "Document archive" }]}
        title="Document archive"
        description="Every scanned or uploaded original, kept unchanged, with the agreements found in it."
      />

      <div className="card overflow-hidden">
        {docs.length === 0 ? (
          <EmptyState title="No documents yet" action={<Link href="/upload" className="btn-primary">Add the first agreement</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="border-b border-line bg-slate-50">
                <tr><th className="th">File</th><th className="th">Agreements found</th><th className="th">Source</th><th className="th">Received</th><th className="th">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/documents/${d.id}`} className="block max-w-[40ch] truncate font-medium text-brand-600 hover:underline">{d.originalName}</Link>
                      <span className="text-[12px] text-slate-500">{d.pageCount} page{d.pageCount === 1 ? "" : "s"}, {(d.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                    </td>
                    <td className="td">
                      {d.agreements.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {d.agreements.map((a) => (
                            <li key={a.id}>
                              <Link href={`/agreements/${a.id}`} className="text-slate-800 hover:underline">{a.typeLabel}</Link>
                              {a.university && <span className="text-[12px] text-slate-500"> · {a.university.name}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="td text-slate-700">{d.source === "scan" ? "Camera scan" : "Upload"}</td>
                    <td className="td whitespace-nowrap text-slate-600">{formatDate(d.createdAt)}</td>
                    <td className="td">
                      {d.status === "processing" && <Badge tone="blue">Reading</Badge>}
                      {d.status === "failed" && <Badge tone="red">Needs retry</Badge>}
                      {d.status === "done" && <Badge tone="green">Read</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
