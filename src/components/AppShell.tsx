"use client";

import { ClipboardCheck, FolderOpen, LayoutGrid, Landmark, Menu, MessageSquareText, Plus, Search, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

export function AppShell({ pending, children }: { pending: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const nav: NavItem[] = [
    { href: "/", label: "Vault Agent", icon: MessageSquareText },
    { href: "/overview", label: "Overview", icon: LayoutGrid },
    { href: "/universities", label: "Universities", icon: Landmark },
    { href: "/review", label: "Review queue", icon: ClipboardCheck, badge: pending },
    { href: "/documents", label: "Document archive", icon: FolderOpen },
    { href: "/search", label: "Search", icon: Search },
  ];

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-950 text-slate-300">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="text-[15px] font-semibold text-white">Agreement Vault</div>
        <div className="mt-0.5 text-[12px] text-slate-400">EUSAI Group</div>
      </div>

      <nav className="flex-1 space-y-px px-2 py-3">
        {nav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded px-3 py-2 text-[13px] transition-colors ${active ? "bg-white/10 font-medium text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"}`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {item.label}
              {!!item.badge && <span className="ml-auto rounded bg-white/10 px-1.5 text-[11px] font-medium tabular-nums text-slate-200">{item.badge}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-slate-500">
        Internal use only. Records are read from signed copies and verified by a reviewer.
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">
            {sidebar}
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button aria-label="Open menu" onClick={onMenu} className="-ml-1 rounded p-2 text-slate-600 hover:bg-slate-100 lg:hidden">
          <Menu className="h-5 w-5" />
        </button>

        <form
          className="relative w-full max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            const q = input.current?.value.trim();
            if (q) router.push(`/?q=${encodeURIComponent(q)}`);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.75} />
          <input ref={input} placeholder="Ask the Vault Agent a question" className="input bg-slate-50 pr-16 pl-9" />
          <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10px] text-slate-500 sm:block">Ctrl K</kbd>
        </form>

        <Link href="/upload" className="btn-primary ml-auto">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New agreement</span>
        </Link>
      </div>
    </div>
  );
}
