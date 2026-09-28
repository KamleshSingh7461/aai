import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Group companies as listed in the existing EUSAI admin panel. Aliases are the
// spellings printed on signed documents so uploads can be matched automatically.
const companies = [
  {
    code: "EUSAI",
    name: "Elite Universal Sports Alliance of India Pvt. Ltd.",
    aliases: [
      "EUSAI",
      "Elite Universal Sports Alliance India Private Limited",
      "Elite Universal Sports Alliance of India Private Limited",
      "EliteUniversal Sports Alliance of India Private Limited",
    ],
  },
  { code: "ACI", name: "Alumni Connect India Pvt. Ltd.", aliases: ["ACI", "Alumni Connect India Private Limited"] },
  { code: "FGSN", name: "Freedom Global Sports Network", aliases: ["FGSN"] },
  { code: "SDN", name: "Sports Drip Network", aliases: ["SDN"] },
  // Full names not yet confirmed; the old database stores only these codes.
  { code: "EFLI", name: "EFLI", aliases: ["EFLI"] },
  { code: "ESI", name: "ESI", aliases: ["ESI"] },
];

async function main() {
  for (const c of companies) {
    await db.company.upsert({
      where: { code: c.code },
      update: { name: c.name, aliases: c.aliases },
      create: { ...c, isGroup: true },
    });
  }
  console.log(`Seeded ${companies.length} companies`);
}

main().finally(() => db.$disconnect());
