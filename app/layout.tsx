import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KI-Barometer",
  description:
    "Macht den Erfolg von KI-Einführungen in Unternehmen messbar, sichtbar und steuerbar. Anbieter: dbrains academy.",
};

// Mobile-first: the Survey-Runner is used primarily on phones (SPEC.md §5).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
