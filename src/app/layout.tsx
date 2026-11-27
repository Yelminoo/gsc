import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "GSC Gemmological School · Admin",
  description: "Students, tuition, invoices and collections",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Opt the whole app into per-request rendering so the CSP nonce can be applied.
  await connection();
  // An explicit choice from the theme toggle; without one the app follows the operating system.
  const saved = (await cookies()).get("theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : undefined;
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full bg-bg font-sans text-ink">{children}</body>
    </html>
  );
}
