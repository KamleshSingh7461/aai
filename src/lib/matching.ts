import type { Company, University } from "@prisma/client";

const STOP = new Set(["the", "of", "and", "pvt", "private", "limited", "ltd", "inc", "university", "college", "india", "at"]);

export function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(name: string): Set<string> {
  return new Set(normalise(name).split(" ").filter((t) => t && !STOP.has(t)));
}

/** Word-overlap score between 0 and 1 (Jaccard on meaningful words). */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return normalise(a) === normalise(b) ? 1 : 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

function namesOf(entity: { name: string; aliases: unknown }): string[] {
  const aliases = Array.isArray(entity.aliases) ? (entity.aliases as string[]) : [];
  return [entity.name, ...aliases];
}

/**
 * Returns the best match only when it is unambiguous. Anything uncertain is left
 * for the reviewer to pick, so a document is never filed under the wrong name.
 */
export function bestMatch<T extends University | Company>(printed: string | null | undefined, candidates: T[]): T | null {
  if (!printed) return null;
  const exact = candidates.find((c) => namesOf(c).some((n) => normalise(n) === normalise(printed)));
  if (exact) return exact;

  const scored = candidates
    .map((c) => ({ c, score: Math.max(...namesOf(c).map((n) => similarity(n, printed))) }))
    .sort((x, y) => y.score - x.score);
  const [first, second] = scored;
  if (first && first.score >= 0.75 && (!second || first.score - second.score >= 0.2)) return first.c;
  return null;
}
