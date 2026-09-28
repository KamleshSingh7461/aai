import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ExtractedDocument } from "@/lib/extraction/schema";
import { normalise } from "@/lib/matching";
import { agreementFields } from "@/lib/process";

/** Flattens nested JSON into path -> value so edits can be logged field by field. */
function flatten(value: unknown, prefix = "", out: Record<string, string> = {}) {
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "full_text") continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = value === null || value === undefined ? "" : String(value);
  }
  return out;
}

/** Remembers the printed spelling so the next upload from the same party matches automatically. */
async function learnAlias(kind: "university" | "company", id: string, printed: string | undefined) {
  if (!printed) return;
  const entity = kind === "university" ? await db.university.findUnique({ where: { id } }) : await db.company.findUnique({ where: { id } });
  if (!entity) return;
  const aliases = Array.isArray(entity.aliases) ? (entity.aliases as string[]) : [];
  if ([entity.name, ...aliases].some((n) => normalise(n) === normalise(printed))) return;
  const data = { aliases: [...aliases, printed] };
  if (kind === "university") await db.university.update({ where: { id }, data });
  else await db.company.update({ where: { id }, data });
}

/**
 * Other documents from the same file that print the same university/company name
 * and are still unassigned get the same assignment (they stay in review).
 */
async function fillSiblings(sourceDocumentId: string, selfId: string, data: ExtractedDocument, universityId: string | null, companyId: string | null, user: string) {
  const siblings = await db.agreement.findMany({ where: { sourceDocumentId, id: { not: selfId } } });
  for (const s of siblings) {
    const sd = s.data as unknown as ExtractedDocument;
    const same = (a?: string | null, b?: string | null) => !!a && !!b && normalise(a) === normalise(b);
    const setUniversity = !s.universityId && universityId && same(sd.university?.name, data.university?.name);
    const setCompany = !s.companyId && companyId && same(sd.company?.name, data.company?.name);
    if (!setUniversity && !setCompany) continue;
    await db.agreement.update({
      where: { id: s.id },
      data: {
        ...(setUniversity ? { universityId } : {}),
        ...(setCompany ? { companyId } : {}),
        auditLogs: { create: { action: "assigned from same file", newValue: [setUniversity && "university", setCompany && "company"].filter(Boolean).join(", "), user } },
      },
    });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const user: string = body.user || "reviewer";

  const agreement = await db.agreement.findUnique({ where: { id }, include: { sourceDocument: true } });
  if (!agreement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = ExtractedDocument.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Some edited values are not valid", details: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }

  const universityId: string | null = body.universityId || null;
  const companyId: string | null = body.companyId || null;
  const approve = body.action === "approve";
  if (approve && (!universityId || !companyId)) {
    return NextResponse.json({ error: "Choose the university and company before approving." }, { status: 400 });
  }

  const fields = agreementFields(parsed.data, agreement.sourceDocument.pageCount);

  const before = flatten(agreement.data);
  const after = flatten(parsed.data);
  const logs: Prisma.AuditLogCreateManyAgreementInput[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if ((before[key] ?? "") !== (after[key] ?? "")) {
      logs.push({ action: "edited", field: key, oldValue: before[key] ?? null, newValue: after[key] ?? null, user });
    }
  }
  if (agreement.universityId !== universityId) logs.push({ action: "edited", field: "university", oldValue: agreement.universityId, newValue: universityId, user });
  if (agreement.companyId !== companyId) logs.push({ action: "edited", field: "company", oldValue: agreement.companyId, newValue: companyId, user });
  if (approve) logs.push({ action: "approved", user });

  const updated = await db.agreement.update({
    where: { id },
    data: {
      ...fields,
      flags: fields.flags as unknown as Prisma.InputJsonValue,
      universityId,
      companyId,
      ...(approve ? { status: "approved", reviewedBy: user, reviewedAt: new Date() } : {}),
      auditLogs: { createMany: { data: logs } },
    },
  });

  if (universityId) await learnAlias("university", universityId, parsed.data.university?.name);
  if (companyId) await learnAlias("company", companyId, parsed.data.company?.name);
  await fillSiblings(agreement.sourceDocumentId, id, parsed.data, universityId, companyId, user);

  return NextResponse.json({ id: updated.id, status: updated.status, flags: fields.flags });
}
