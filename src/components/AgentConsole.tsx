"use client";

import { AlertTriangle, ArrowRight, Check, ChevronDown, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader } from "./ui";

type Step =
  | { kind: "thinking"; text: string }
  | { kind: "tool"; id: string; name: string; label: string; state: "running" | "done" | "failed"; summary?: string };

type AssistantTurn = { role: "assistant"; content: string; steps: Step[]; state: "working" | "done" | "error"; error?: string };
type Turn = { role: "user"; content: string } | AssistantTurn;

export function AgentConsole({ connected, stats, suggestions, initialQuestion }: { connected: boolean; stats: { universities: number; agreements: number; approved: number }; suggestions: string[]; initialQuestion?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (initialQuestion && connected && !asked.current) {
      asked.current = true;
      ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  useEffect(() => {
    if (turns.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  function patchLast(fn: (t: AssistantTurn) => AssistantTurn) {
    setTurns((list) => {
      const last = list[list.length - 1];
      if (!last || last.role !== "assistant") return list;
      return [...list.slice(0, -1), fn(last)];
    });
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const history = [...turns.filter((t) => t.role === "user" || t.state === "done").map((t) => ({ role: t.role, content: t.content })), { role: "user" as const, content: q }];
    setTurns((list) => [...list, { role: "user", content: q }, { role: "assistant", content: "", steps: [], state: "working" }]);

    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.filter((m) => m.content) }) });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "The agent could not be reached.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          patchLast((t) => {
            const steps = [...t.steps];
            const last = steps[steps.length - 1];
            switch (e.t) {
              case "thinking":
                if (last?.kind === "thinking") steps[steps.length - 1] = { ...last, text: last.text + e.text };
                else steps.push({ kind: "thinking", text: e.text });
                return { ...t, steps };
              case "tool_start":
                steps.push({ kind: "tool", id: e.id, name: e.name, label: e.label, state: "running" });
                return { ...t, steps };
              case "tool_end":
                return { ...t, steps: steps.map((s) => (s.kind === "tool" && s.id === e.id ? { ...s, state: e.ok ? "done" : "failed", summary: e.summary } : s)) };
              case "text":
                return { ...t, content: t.content + e.delta };
              case "error":
                return { ...t, state: "error", error: e.message };
              case "done":
                return { ...t, state: "done" };
              default:
                return t;
            }
          });
        }
      }
      patchLast((t) => (t.state === "working" ? { ...t, state: t.content ? "done" : "error", error: t.content ? undefined : "The agent stopped without answering." } : t));
    } catch (err) {
      patchLast((t) => ({ ...t, state: "error", error: err instanceof Error ? err.message : "Something went wrong." }));
    } finally {
      setBusy(false);
    }
  }

  const empty = turns.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Vault Agent"
        description="Ask questions about agreements in plain English. The agent searches the records, opens the relevant agreements and answers with references to the source documents. It can read records but cannot change them."
        actions={
          connected ? (
            <span className="flex items-center gap-1.5 text-[13px] text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-600" />Connected</span>
          ) : (
            <span className="flex items-center gap-1.5 text-[13px] text-slate-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Not connected</span>
          )
        }
      />

      {!connected && (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          The agent needs a Claude API key. Add <code className="font-mono">ANTHROPIC_API_KEY</code> to the <code className="font-mono">.env</code> file and restart the app.
        </div>
      )}

      {!empty && (
        <div className="space-y-6">
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-md bg-slate-100 px-4 py-2.5 text-[14px] text-slate-900">{t.content}</div>
              </div>
            ) : (
              <AssistantReply key={i} turn={t} onRetry={() => ask((turns[i - 1] as { content: string }).content)} />
            ),
          )}
          <div ref={bottom} />
        </div>
      )}

      <div className={empty ? "" : "sticky bottom-0 -mx-1 mt-6 bg-canvas px-1 pt-2 pb-5"}>
        <Composer value={input} onChange={setInput} onSubmit={() => ask(input)} busy={busy} disabled={!connected} />
      </div>

      {empty && (
        <>
          <section className="mt-8">
            <h2 className="mb-2 text-[13px] font-medium text-slate-500">Example questions</h2>
            <ul className="card divide-y divide-line">
              {suggestions.map((s) => (
                <li key={s}>
                  <button disabled={!connected || busy} onClick={() => ask(s)} className="group flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent">
                    <span className="flex-1">{s}</span>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-600" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <p className="mt-4 text-[13px] text-slate-500">
            Searching {stats.agreements} agreement{stats.agreements === 1 ? "" : "s"} across {stats.universities} universit{stats.universities === 1 ? "y" : "ies"}; {stats.approved} verified by reviewers.
          </p>
        </>
      )}
    </div>
  );
}

function Composer({ value, onChange, onSubmit, busy, disabled }: { value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean; disabled: boolean }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="card flex items-end gap-2 p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100"
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={2}
        disabled={disabled}
        aria-label="Question for the Vault Agent"
        placeholder={disabled ? "Agent not connected" : "Type a question, e.g. Which agreements with EUSAI end this year?"}
        className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
      />
      <button type="submit" disabled={disabled || busy || !value.trim()} className="btn-primary">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Ask
      </button>
    </form>
  );
}

function AssistantReply({ turn, onRetry }: { turn: AssistantTurn; onRetry: () => void }) {
  const [open, setOpen] = useState(true);
  const working = turn.state === "working";
  const lookups = turn.steps.filter((s) => s.kind === "tool").length;

  useEffect(() => {
    if (turn.state === "done") setOpen(false);
  }, [turn.state]);

  return (
    <div className="space-y-2 animate-fade-in">
      <div className="text-[12px] font-medium text-slate-500">Vault Agent</div>

      <div className="rounded-md border border-line bg-white">
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-600 hover:bg-slate-50">
          {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : turn.state === "error" ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> : <Check className="h-3.5 w-3.5 text-emerald-700" />}
          {working ? "Working" : `${lookups} lookup${lookups === 1 ? "" : "s"}`}
          <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <ol className="space-y-1.5 border-t border-line px-3 py-2.5 text-[13px]">
            {turn.steps.length === 0 && working && <li className="text-slate-500">Reading the question…</li>}
            {turn.steps.map((s, i) =>
              s.kind === "thinking" ? (
                <li key={i} className="line-clamp-2 pl-5 text-slate-500">{s.text}</li>
              ) : (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="grid h-3.5 w-3.5 shrink-0 place-items-center">
                    {s.state === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : s.state === "done" ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{s.label}</span>
                  {s.summary && <span className="shrink-0 text-slate-500">{s.summary}</span>}
                </li>
              ),
            )}
          </ol>
        )}
      </div>

      {turn.content && (
        <div className="card px-5 py-4">
          <Answer markdown={turn.content} />
        </div>
      )}
      {turn.state === "error" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13px] text-rose-900">
          <span className="flex-1">{turn.error}</span>
          <button onClick={onRetry} className="btn-secondary h-8"><RotateCcw className="h-3.5 w-3.5" />Retry</button>
        </div>
      )}
    </div>
  );
}

function Answer({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = "", children }) =>
            href.startsWith("/") ? (
              <Link href={href} className="font-medium text-brand-600 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600">{children}</Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="text-brand-600 underline">{children}</a>
            ),
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          h1: ({ children }) => <h3 className="font-semibold text-slate-900">{children}</h3>,
          h2: ({ children }) => <h3 className="font-semibold text-slate-900">{children}</h3>,
          h3: ({ children }) => <h3 className="font-semibold text-slate-900">{children}</h3>,
          code: ({ children }) => <code className="rounded bg-slate-100 px-1 font-mono text-[13px]">{children}</code>,
          table: ({ children }) => <div className="overflow-x-auto rounded border border-line"><table className="w-full text-[13px]">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-slate-50 text-left text-slate-500">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => <td className="border-t border-line px-3 py-2 tabular-nums">{children}</td>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-line-strong pl-3 text-slate-600">{children}</blockquote>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
