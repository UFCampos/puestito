import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PLAUSIBLE_DOMAIN, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "TuPuestito | Comisiones de arte argentino", template: "%s | TuPuestito" },
  description: SITE_DESCRIPTION,
  openGraph: { siteName: SITE_NAME, locale: "es_AR", type: "website", description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
        {PLAUSIBLE_DOMAIN && <Script defer data-domain={PLAUSIBLE_DOMAIN} src="https://plausible.io/js/script.js" strategy="afterInteractive" />}
      </body>
    </html>
  );
}
