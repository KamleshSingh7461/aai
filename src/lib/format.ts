export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function flagCount(flags: unknown): { warnings: number; info: number } {
  const list = Array.isArray(flags) ? (flags as { severity: string }[]) : [];
  return { warnings: list.filter((f) => f.severity === "warning").length, info: list.filter((f) => f.severity === "info").length };
}

export function expiryState(expiry: Date | null): "active" | "expiring" | "expired" | null {
  if (!expiry) return null;
  const days = (expiry.getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days < 180) return "expiring";
  return "active";
}
