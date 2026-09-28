"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/ui";

type PageImage = { id: string; blob: Blob; url: string };

/** Re-encodes a photo as JPEG (max 2400px) so phone formats like HEIC and huge camera files upload reliably. */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", 0.88));
}

export default function UploadPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"scan" | "upload">("scan");
  const [pages, setPages] = useState<PageImage[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addImages(files: FileList | File[]) {
    setError(null);
    setPreparing(true);
    try {
      const added = await Promise.all(
        [...files].map(async (f) => {
          const blob = await toJpeg(f);
          return { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) };
        }),
      );
      setPages((p) => [...p, ...added]);
    } catch {
      setError("One of the images could not be read. Please take the photo again.");
    } finally {
      setPreparing(false);
    }
  }

  function handleFiles(files: FileList | File[]) {
    const list = [...files];
    const pdfs = list.filter((f) => f.type === "application/pdf");
    if (pdfs.length > 0) {
      if (pdfs.length > 1 || list.length > 1) setError("Please upload one PDF at a time.");
      setPdf(pdfs[0]);
      setPages([]);
      return;
    }
    setPdf(null);
    addImages(list.filter((f) => f.type.startsWith("image/")));
  }

  function move(i: number, dir: -1 | 1) {
    setPages((p) => {
      const next = [...p];
      const j = i + dir;
      if (j < 0 || j >= next.length) return p;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("source", mode);
    if (pdf) form.append("files", pdf);
    else pages.forEach((p, i) => form.append("files", new File([p.blob], `page-${i + 1}.jpg`, { type: "image/jpeg" })));
    const res = await fetch("/api/documents", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(body.error ?? "Upload failed");
      return;
    }
    router.push(`/documents/${body.id}`);
  }

  const ready = pdf != null || pages.length > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        crumbs={[{ label: "Overview", href: "/overview" }, { label: "New agreement" }]}
        title="New agreement"
        description="Photograph each page of the signed copy or upload a scanned file. The document agent reads it, files it under the university and company, and adds it to the review queue."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="card">
          <div className="flex border-b border-line text-[13px]">
            {(["scan", "upload"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`-mb-px border-b-2 px-4 py-3 ${mode === m ? "border-brand-600 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {m === "scan" ? "Scan with camera" : "Upload a file"}
              </button>
            ))}
          </div>

          <div className="p-4">
            {mode === "scan" ? (
              <>
                <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) addImages(e.target.files); e.target.value = ""; }} />
                <button onClick={() => cameraInput.current?.click()} className="btn-primary h-11 w-full">
                  {pages.length === 0 ? "Photograph page 1" : `Photograph page ${pages.length + 1}`}
                </button>
                <p className="mt-2 text-[13px] text-slate-500">Lay each page flat in good light so the whole page is in frame. Take the pages in order.</p>
              </>
            ) : (
              <>
                <input ref={fileInput} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                  className={`rounded-md border border-dashed px-4 py-10 text-center ${dragging ? "border-brand-500 bg-brand-50" : "border-line-strong"}`}
                >
                  <p className="text-[14px] text-slate-700">Drag a file here, or</p>
                  <button onClick={() => fileInput.current?.click()} className="btn-secondary mt-2">Choose file</button>
                  <p className="mt-3 text-[12px] text-slate-500">One PDF, or JPG/PNG photos of each page (combined in the order selected)</p>
                </div>
              </>
            )}

            {preparing && <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Preparing pages…</p>}

            {pdf && (
              <div className="mt-4 flex items-center gap-3 rounded-md border border-line px-3 py-2.5 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">{pdf.name}</div>
                  <div className="text-slate-500">PDF, {(pdf.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
                <button className="text-rose-700 hover:underline" onClick={() => setPdf(null)}>Remove</button>
              </div>
            )}

            {pages.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span className="text-slate-600">{pages.length} page{pages.length === 1 ? "" : "s"}, in reading order</span>
                  <button className="text-slate-500 hover:text-rose-700 hover:underline" onClick={() => setPages([])}>Remove all</button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {pages.map((p, i) => (
                    <figure key={p.id} className="overflow-hidden rounded-md border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full bg-slate-100 object-cover" />
                      <figcaption className="flex items-center justify-between border-t border-line px-2 py-1 text-[12px]">
                        <span className="font-medium text-slate-700">Page {i + 1}</span>
                        <span className="flex gap-2 text-slate-500">
                          <button disabled={i === 0} onClick={() => move(i, -1)} className="hover:text-slate-900 disabled:opacity-30" aria-label="Move earlier">←</button>
                          <button disabled={i === pages.length - 1} onClick={() => move(i, 1)} className="hover:text-slate-900 disabled:opacity-30" aria-label="Move later">→</button>
                          <button onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))} className="text-rose-700 hover:underline">Remove</button>
                        </span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-900">{error}</p>}
          </div>

          <div className="flex items-center gap-3 border-t border-line bg-slate-50 px-4 py-3">
            <p className="text-[12px] text-slate-500">The original is kept unchanged as the record copy.</p>
            <button onClick={submit} disabled={!ready || busy || preparing} className="btn-primary ml-auto">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Uploading…" : "Submit for reading"}
            </button>
          </div>
        </div>

        <aside className="text-[13px] text-slate-600">
          <h2 className="mb-2 font-semibold text-slate-900">What happens next</h2>
          <ol className="list-decimal space-y-2 pl-4">
            <li>Every page is transcribed, including handwriting and stamps.</li>
            <li>Terms are recorded exactly as printed, each with its page number.</li>
            <li>Totals, dates and party names are cross-checked and any mismatch is flagged.</li>
            <li>A reviewer compares the record with the scan and approves it.</li>
          </ol>
          <h2 className="mt-6 mb-2 font-semibold text-slate-900">For a clean scan</h2>
          <ul className="list-disc space-y-2 pl-4">
            <li>Include every page, including signature and stamp pages.</li>
            <li>Letters sent together can stay in one file; they are split automatically.</li>
            <li>Avoid shadows and glare over dates and amounts.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
