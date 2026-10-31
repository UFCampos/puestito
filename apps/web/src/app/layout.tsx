import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "../components/Navbar";

export const metadata: Metadata = {
  title: "TuPuestito | Plataforma de Comisiones de Arte para Artistas Argentinos",
  description:
    "El marketplace para comisionar arte digital y tradicional a artistas independientes argentinos con Mercado Pago split y pagos seguros."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="flex flex-col min-h-screen antialiased bg-neutral-50 text-neutral-900">
        <Navbar />
        <div className="flex-1">{children}</div>
        <footer className="bg-white border-t border-neutral-200 py-8 text-center text-sm text-neutral-500">
          <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎪</span>
              <span className="font-bold text-neutral-800">TuPuestito</span>
              <span>— El puesto virtual de los artistas argentinos</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="/terms" className="hover:underline">
                Términos y Condiciones
              </a>
              <a href="/terms#anti-ia" className="hover:underline">
                Política 100% Humano (Anti-IA)
              </a>
              <span className="text-neutral-400">Hecho con 💜 en Argentina</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
