import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "TuPuestito | Plataforma de Comisiones y Arte Argentino",
  description:
    "Encontrá a tus artistas argentinos favoritos, pedí comisiones con pago en 2 etapas vía Mercado Pago y apoyá el arte 100% humano."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
