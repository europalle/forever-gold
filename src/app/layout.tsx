import type { Metadata } from "next";
import { JetBrains_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

const figures = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-figures", display: "swap" });
const publicSans = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-public", display: "swap" });

export const metadata: Metadata = {
  title: "Forever Gold",
  description: "Market advice for WoW Forever: what to sell, cure, combine and hold.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${publicSans.variable} ${figures.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
