/**
 * Datos de demostración — SOLO desarrollo.  `pnpm --filter @tupuestito/api db:seed`
 * Crea las cuentas a través de Better Auth (contraseñas hasheadas como en producción).
 */
import { eq } from "drizzle-orm";
import { config, isProd } from "./config.js";
import { db, pool, runMigrations } from "./db/index.js";
import { auth } from "./auth.js";
import { artistProfiles, commissionAddons, commissionServices, portfolioItems, users } from "./db/schema.js";
import { setPortfolioTags, setServiceTags } from "./lib/tags.js";

if (isProd) {
  console.error("❌ El seed de demo no se ejecuta en producción.");
  process.exit(1);
}

const DEMO_PASSWORD = "tupuestito123";
const img = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

async function createUser(email: string, username: string, name: string, image: string) {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;
  await auth.api.signUpEmail({ body: { email, password: DEMO_PASSWORD, name, username, image } });
  const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, created!.id));
  return created!;
}

type SeedService = {
  title: string;
  description: string;
  priceArs: number;
  priceUsd?: number;
  paymentPlan: "FULL_100" | "SPLIT_ON_SKETCH" | "SPLIT_ON_FINAL_PREVIEW" | "MILESTONES";
  milestones?: { title: string; description: string; percent: number; days: number }[];
  turnaroundDays: number;
  maxSlots: number;
  revisionsIncluded: number;
  rating: "SFW" | "SUGGESTIVE" | "NSFW";
  tags: string[];
  addons: { name: string; priceArs: number }[];
};
type SeedPortfolio = { title: string; imageUrl: string; rating: "SFW" | "SUGGESTIVE" | "NSFW"; tags: string[] };

async function createArtist(
  user: { id: string },
  profile: Partial<typeof artistProfiles.$inferInsert>,
  services: SeedService[],
  portfolio: SeedPortfolio[]
) {
  const [existing] = await db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);
  if (existing) return;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ role: "ARTIST" }).where(eq(users.id, user.id));
    const [p] = await tx.insert(artistProfiles).values({ userId: user.id, ...profile }).returning();
    for (const s of services) {
      const { tags, addons, priceUsd, ...rest } = s;
      const [svc] = await tx
        .insert(commissionServices)
        .values({ ...rest, priceUsd: priceUsd?.toFixed(2) ?? null, artistId: p!.id })
        .returning();
      if (addons.length) await tx.insert(commissionAddons).values(addons.map((a) => ({ ...a, serviceId: svc!.id })));
      await setServiceTags(tx, svc!.id, tags);
    }
    for (const item of portfolio) {
      const { tags, ...rest } = item;
      const [created] = await tx.insert(portfolioItems).values({ ...rest, artistId: p!.id }).returning();
      await setPortfolioTags(tx, created!.id, tags);
    }
  });
}

async function main() {
  await runMigrations();

  const maomao = await createUser("maomao@tupuestito.com", "maomao", "MaoMao Atelier 🌸", img("1534528741775-53994a69daeb", 300));
  await createArtist(
    maomao,
    {
      bio: "Ilustradora de Buenos Aires 🇦🇷. Fan de Vocaloid, Genshin y los OCs con mucha personalidad.",
      bannerUrl: img("1618005182384-a83a8bd57fbe", 1400),
      commissionStatus: "OPEN",
      defaultWatermarkMode: "AUTO_TEXT",
      termsOfService:
        "1. La seña no es reembolsable una vez entregado el boceto.\n2. Prohibido usar mi arte para entrenar IA.\n3. Uso personal (consultar licencia comercial).",
      isVerifiedHuman: true,
      socialLinks: { twitter: "https://x.com/maomao_art", instagram: "https://instagram.com/maomao_art" }
    },
    [
      {
        title: "Icono / Headshot Anime Express",
        description: "Avatar súper expresivo de tu OC, VTuber o personaje favorito. Fondo simple con degradado.",
        priceArs: 25000,
        priceUsd: 20,
        paymentPlan: "SPLIT_ON_SKETCH",
        turnaroundDays: 7,
        maxSlots: 4,
        revisionsIncluded: 2,
        rating: "SFW",
        tags: ["Icono", "Anime", "VTuber", "Vocaloid"],
        addons: [
          { name: "Expresión facial extra", priceArs: 5000 },
          { name: "Mascota o peluche chiquito", priceArs: 7000 }
        ]
      },
      {
        title: "Busto Full Color Renderizado",
        description: "Busto con render completo, iluminación dramática y fondo atmosférico.",
        priceArs: 48000,
        priceUsd: 38,
        paymentPlan: "SPLIT_ON_SKETCH",
        turnaroundDays: 12,
        maxSlots: 3,
        revisionsIncluded: 2,
        rating: "SFW",
        tags: ["Busto", "Full Color", "Genshin"],
        addons: [
          { name: "Personaje adicional", priceArs: 38000 },
          { name: "Fondo escénico detallado", priceArs: 15000 }
        ]
      },
      {
        title: "Cuerpo Completo (Fullbody) + Vista Previa Final",
        description: "Fullbody con render completo. El 2° pago se hace al aprobar la vista previa final con marca de agua.",
        priceArs: 85000,
        priceUsd: 68,
        paymentPlan: "SPLIT_ON_FINAL_PREVIEW",
        turnaroundDays: 20,
        maxSlots: 2,
        revisionsIncluded: 3,
        rating: "SUGGESTIVE",
        tags: ["Fullbody", "Diseño OC"],
        addons: [{ name: "Licencia comercial VTuber/Stream", priceArs: 35000 }]
      },
      {
        title: "Ilustración completa con fondo (por etapas)",
        description: "Pieza grande con escenario. Se paga etapa por etapa: cada una se abona antes de empezarla.",
        priceArs: 150000,
        priceUsd: 120,
        paymentPlan: "MILESTONES",
        milestones: [
          { title: "Boceto y composición", description: "Pose, encuadre y paleta tentativa.", percent: 25, days: 4 },
          { title: "Lineart", description: "Línea limpia del personaje y el fondo.", percent: 25, days: 5 },
          { title: "Color base y luces", description: "Colores planos e iluminación general.", percent: 25, days: 5 },
          { title: "Render final", description: "Detalles, efectos y entrega en alta.", percent: 25, days: 6 }
        ],
        turnaroundDays: 20,
        maxSlots: 1,
        revisionsIncluded: 4,
        rating: "SFW",
        tags: ["Fullbody", "Fondo", "Ilustración"],
        addons: [{ name: "Segundo personaje", priceArs: 60000 }]
      }
    ],
    [
      { title: "Hatsune Miku • Cyber Neon Tour", imageUrl: img("1579783900882-c0d3dad7b119"), rating: "SFW", tags: ["Vocaloid", "Miku", "Anime"] },
      { title: "Guerrera Astral (Comisión OC)", imageUrl: img("1544717302-de2939b7ef71"), rating: "SFW", tags: ["OC", "Fantasía"] },
      { title: "Summer Sunset Pin-up", imageUrl: img("1578632767115-351597cf2477"), rating: "SUGGESTIVE", tags: ["Anime", "Summer"] },
      { title: "Ficha de Referencia VTuber 2.0", imageUrl: img("1607604276583-eef5d076aa5f"), rating: "SFW", tags: ["VTuber", "RefSheet"] }
    ]
  );

  const kaito = await createUser("kaito@tupuestito.com", "kaito_ink", "Kaito Ink ⚡", img("1535713875002-d1d0cf377fde", 300));
  await createArtist(
    kaito,
    {
      bio: "Emotes, chibis y lineart estilo manga desde Córdoba.",
      bannerUrl: img("1550745165-9bc0b252726f", 1400),
      commissionStatus: "WAITLIST",
      defaultWatermarkMode: "AUTO_TEXT",
      termsOfService: "1. Pago 100% por adelantado.\n2. Entrega en PNG transparente.\n3. Sin uso para IA.",
      isVerifiedHuman: true,
      socialLinks: { twitter: "https://x.com/kaito_ink" }
    },
    [
      {
        title: "Pack x3 Emotes para Twitch / Discord",
        description: "Tres emotes en 112/56/28 px listos para subir.",
        priceArs: 32000,
        priceUsd: 25,
        paymentPlan: "FULL_100",
        turnaroundDays: 10,
        maxSlots: 5,
        revisionsIncluded: 1,
        rating: "SFW",
        tags: ["Emotes", "Chibi", "Twitch"],
        addons: [{ name: "Emote adicional al pack", priceArs: 9500 }]
      }
    ],
    [
      { title: "Colección Chibis Vocaloid", imageUrl: img("1563089145-599997674d42"), rating: "SFW", tags: ["Chibi", "Vocaloid"] },
      { title: "Manga Shonen • Splash Page", imageUrl: img("1518709268805-4e9042af9f23"), rating: "SFW", tags: ["Manga", "Lineart"] }
    ]
  );

  await createUser("comprador@tupuestito.com", "uriel_fan", "Uriel Comprador 🎨", img("1527980965255-d3b416303d12", 300));

  console.log(`✅ Seed listo en ${config.DATABASE_URL.replace(/\/\/[^@]+@/, "//***@")}`);
  console.log(`   Cuentas demo (contraseña "${DEMO_PASSWORD}"): maomao, kaito_ink, uriel_fan`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
