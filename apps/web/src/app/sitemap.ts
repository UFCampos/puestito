import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ["", "/ayuda", "/terms", "/privacy", "/anti-ai-policy", "/arrepentimiento"].map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: p === "" ? "daily" : "monthly",
    priority: p === "" ? 1 : 0.4
  }));
  try {
    // Durante el build la API puede no estar: en ese caso van solo las páginas fijas
    const res = await fetch(`${API}/api/artists/sitemap`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return pages;
    const { artists } = (await res.json()) as { artists: { username: string; updatedAt: string }[] };
    return [...pages, ...artists.map((a) => ({ url: `${SITE_URL}/u/${a.username}`, lastModified: new Date(a.updatedAt), changeFrequency: "weekly" as const, priority: 0.8 }))];
  } catch {
    return pages;
  }
}
