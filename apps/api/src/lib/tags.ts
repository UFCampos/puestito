import { eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../db/index.js";
import { tags, portfolioItemTags, commissionServiceTags } from "../db/schema.js";

export function slugifyTag(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Crea los tags que falten y devuelve sus ids */
export async function upsertTags(tx: DbOrTx, names: string[]): Promise<string[]> {
  const unique = new Map<string, string>();
  for (const raw of names.slice(0, 15)) {
    const slug = slugifyTag(raw);
    if (slug.length >= 2) unique.set(slug, raw.trim().slice(0, 40));
  }
  if (unique.size === 0) return [];
  await tx
    .insert(tags)
    .values([...unique].map(([slug, name]) => ({ slug, name })))
    .onConflictDoNothing({ target: tags.slug });
  const rows = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.slug, [...unique.keys()]));
  return rows.map((r) => r.id);
}

export async function setPortfolioTags(tx: DbOrTx, itemId: string, names: string[]) {
  const ids = await upsertTags(tx, names);
  await tx.delete(portfolioItemTags).where(eq(portfolioItemTags.portfolioItemId, itemId));
  if (ids.length) await tx.insert(portfolioItemTags).values(ids.map((tagId) => ({ portfolioItemId: itemId, tagId })));
}

export async function setServiceTags(tx: DbOrTx, serviceId: string, names: string[]) {
  const ids = await upsertTags(tx, names);
  await tx.delete(commissionServiceTags).where(eq(commissionServiceTags.serviceId, serviceId));
  if (ids.length) await tx.insert(commissionServiceTags).values(ids.map((tagId) => ({ serviceId, tagId })));
}

/** Devuelve un mapa ownerId → nombres de tags */
export async function loadTags(
  tx: DbOrTx,
  kind: "portfolio" | "service",
  ownerIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ownerIds.length === 0) return map;
  const rows =
    kind === "portfolio"
      ? await tx
          .select({ ownerId: portfolioItemTags.portfolioItemId, name: tags.name })
          .from(portfolioItemTags)
          .innerJoin(tags, eq(portfolioItemTags.tagId, tags.id))
          .where(inArray(portfolioItemTags.portfolioItemId, ownerIds))
      : await tx
          .select({ ownerId: commissionServiceTags.serviceId, name: tags.name })
          .from(commissionServiceTags)
          .innerJoin(tags, eq(commissionServiceTags.tagId, tags.id))
          .where(inArray(commissionServiceTags.serviceId, ownerIds));
  for (const r of rows) {
    const list = map.get(r.ownerId) ?? [];
    list.push(r.name);
    map.set(r.ownerId, list);
  }
  return map;
}
