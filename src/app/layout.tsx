import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forever Gold",
  description: "Market advice for WoW Forever: what to sell, cure, combine and hold.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
