import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!name || !code) return NextResponse.json({ error: "Name and short code are required" }, { status: 400 });
  if (await db.company.findUnique({ where: { code } })) {
    return NextResponse.json({ error: `A company with code ${code} already exists` }, { status: 409 });
  }
  const company = await db.company.create({
    data: { name, code, isGroup: Boolean(body.isGroup), aliases: Array.isArray(body.aliases) ? body.aliases : [] },
  });
  return NextResponse.json(company);
}
