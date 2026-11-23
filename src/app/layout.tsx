import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Banyanroot: HR consultancy, one login", template: "%s · Banyanroot" },
  description: "Run every client company, compliance deadline, requisition and invoice from one place.",
};

export const viewport: Viewport = { themeColor: "#c0c6c9", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
