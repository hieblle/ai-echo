import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Design D typeface (DECISIONS D4.9): light, geometric, with weights for
// display numbers (300), body (400) and labels (500/600).
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KI-Barometer",
  description:
    "Macht den Erfolg von KI-Einführungen in Unternehmen messbar, sichtbar und steuerbar. Anbieter: dbrains academy.",
};

// Mobile-first: the Survey-Runner is used primarily on phones (SPEC.md §5).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f5f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={poppins.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
