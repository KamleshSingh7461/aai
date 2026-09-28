import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/Toaster";
import { db } from "@/lib/db";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Agreement Vault", template: "%s · Agreement Vault" },
  description: "University agreements and MoUs across the EUSAI group, read by AI and verified by reviewers.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = await db.agreement.count({ where: { status: "needs_review" } });
  return (
    <html lang="en" className={`${plex.variable} ${plexMono.variable}`}>
      <body>
        <Toaster>
          <AppShell pending={pending}>{children}</AppShell>
        </Toaster>
      </body>
    </html>
  );
}
