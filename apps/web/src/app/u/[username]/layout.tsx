import type { Metadata } from "next";

// Plan Sprint 2: perfil /u/[username] con SEO y OpenGraph
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export async function generateMetadata({
  params
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  try {
    const res = await fetch(`${API_URL}/api/artists/${encodeURIComponent(username)}`, {
      next: { revalidate: 300 }
    });
    if (!res.ok) return { title: "Artista no encontrado | TuPuestito" };
    const { artist } = await res.json();
    const title = `${artist.displayName} (@${artist.username}) | TuPuestito`;
    const description =
      (artist.bio as string | null)?.slice(0, 160) ||
      `Pedí una comisión a @${artist.username} en TuPuestito, pagando en etapas con Mercado Pago.`;
    const image = artist.bannerUrl || artist.avatarUrl;
    return {
      title,
      description,
      alternates: { canonical: `${SITE_URL}/u/${artist.username}` },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/u/${artist.username}`,
        siteName: "TuPuestito",
        type: "profile",
        locale: "es_AR",
        images: image ? [{ url: image }] : undefined
      },
      twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined }
    };
  } catch {
    return { title: `@${username} | TuPuestito` };
  }
}

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
