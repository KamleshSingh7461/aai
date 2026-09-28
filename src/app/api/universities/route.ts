import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const university = await db.university.create({
    data: {
      name,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      pincode: body.pincode || null,
      aliases: Array.isArray(body.aliases) ? body.aliases : [],
    },
  });
  return NextResponse.json(university);
}
