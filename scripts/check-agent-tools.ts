// Runs each Vault Agent tool against the local database (no API call).
import { db } from "../src/lib/db";
import { TOOLS } from "../src/lib/agent/tools";

async function main() {
  const cases: [keyof typeof TOOLS, unknown][] = [
    ["get_overview", {}],
    ["list_universities", { name: "alpha" }],
    ["search_agreements", { company: "aci" }],
    ["scholarship_summary", { university: "Alpha" }],
    ["find_missing_agreements", {}],
    ["list_expiring", { within_days: 365 }],
    ["search_text", { phrase: "rollover" }],
  ];
  for (const [name, input] of cases) {
    const t = TOOLS[name];
    const parsed = t.schema.safeParse(input);
    if (!parsed.success) throw new Error(`${name}: schema rejected ${JSON.stringify(input)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (t.run as any)(parsed.data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log(`${name} — ${(t.label as any)(parsed.data)} → ${out.summary} (${JSON.stringify(out.result).length} chars)`);
  }
  const first = (await db.agreement.findFirst({ where: { type: "scholarship_valuation_letter" } }))!;
  const opened = await TOOLS.get_agreement.run({ id: first.id });
  console.log(`get_agreement → ${opened.summary}`);
  const s = await TOOLS.scholarship_summary.run({ university: "Alpha" });
  console.log(JSON.stringify(s.result, null, 1).slice(0, 900));
}
main().finally(() => db.$disconnect());
