import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db, initDb } from "./db/index.js";
import { users, artistProfiles, portfolioItems, commissionServices } from "./db/schema.js";

initDb();

async function seed() {
  console.log("🌱 Inicializando datos de prueba (Seed)...");

  // 1. Crear Artista Demo (MaoMao Atelier - de la encuesta)
  const artistId = crypto.randomUUID();
  const artistUserId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash("123456", 10);
  const now = new Date().toISOString();

  // Usuario Artista
  db.insert(users)
    .values({
      id: artistUserId,
      email: "maomao@tupuestito.com",
      passwordHash,
      username: "maomao",
      displayName: "MaoMao Atelier 🌸",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80",
      role: "ARTIST",
      showNsfw: false,
      createdAt: now
    })
    .onConflictDoNothing()
    .run();

  // Perfil Artista
  db.insert(artistProfiles)
    .values({
      id: artistId,
      userId: artistUserId,
      bio: "Ilustradora argentina especializada en estilo anime, VTubers y personajes de fantasía ✨ ¡Comisiones abiertas con entrega rápida!",
      bannerUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
      commissionStatus: "OPEN",
      defaultWatermarkMode: "AUTO_TEXT",
      watermarkCustomText: "@maomao • TuPuestito",
      termsOfService: "1. No reembolsable una vez aprobado el boceto.\n2. Se abona 50% de seña para comenzar y 50% al aprobar el boceto.\n3. Prohibido su uso para entrenar modelos de IA.\n4. Solo para uso personal (consultar por comercial).",
      isVerifiedHuman: true,
      socialLinks: JSON.stringify({
        twitter: "https://twitter.com/maomao",
        instagram: "https://instagram.com/maomao",
        vgen: "https://vgen.co/maomao"
      }),
      createdAt: now
    })
    .onConflictDoNothing()
    .run();

  // Servicios de Comisión
  db.insert(commissionServices)
    .values([
      {
        id: crypto.randomUUID(),
        artistId,
        title: "Icono / Headshot Anime",
        description: "Avatar detallado de tu personaje original, VTuber o personaje favorito. Incluye fondo simple con degradado o patrón.",
        priceArs: 25000,
        priceUsd: 20,
        paymentPlan: "SPLIT_ON_SKETCH",
        turnaroundDays: 7,
        maxSlots: 3,
        revisionsIncluded: 2,
        rating: "SFW",
        tags: JSON.stringify(["Icono", "Anime", "VTuber", "Headshot"]),
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        artistId,
        title: "Busto Full Color con Fondo Simple",
        description: "Ilustración de busto a todo color y detalles de sombras suaves. Ideal para fondos de pantalla o perfiles de redes.",
        priceArs: 45000,
        priceUsd: 35,
        paymentPlan: "SPLIT_ON_SKETCH",
        turnaroundDays: 12,
        maxSlots: 2,
        revisionsIncluded: 3,
        rating: "SFW",
        tags: JSON.stringify(["Busto", "Full Color", "Fandom", "Waifu"]),
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        artistId,
        title: "Cuerpo Completo (Fullbody) Detallado",
        description: "Ilustración completa de tu personaje con pose dinámica, accesorios y renderizado prolijísimo.",
        priceArs: 85000,
        priceUsd: 65,
        paymentPlan: "SPLIT_ON_FINAL_PREVIEW",
        turnaroundDays: 20,
        maxSlots: 2,
        revisionsIncluded: 3,
        rating: "SUGGESTIVE",
        tags: JSON.stringify(["Fullbody", "Genshin", "Vocaloid", "Pose"]),
        createdAt: now
      }
    ])
    .onConflictDoNothing()
    .run();

  // Obras de Portfolio
  db.insert(portfolioItems)
    .values([
      {
        id: crypto.randomUUID(),
        artistId,
        title: "Hatsune Miku Digital Star",
        description: "Fanart de Miku con estética cyber-pop.",
        imageUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80",
        rating: "SFW",
        tags: JSON.stringify(["Vocaloid", "Miku", "Digital"]),
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        artistId,
        title: "Cyberpunk Guardian OC",
        description: "Diseño de personaje original para cliente internacional.",
        imageUrl: "https://images.unsplash.com/photo-1544717302-de2939b7ef71?auto=format&fit=crop&w=800&q=80",
        rating: "SFW",
        tags: JSON.stringify(["OC", "Cyberpunk", "Anime"]),
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        artistId,
        title: "Summer Breeze Waifu",
        description: "Estudio de iluminación veraniega con colores pasteles.",
        imageUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80",
        rating: "SUGGESTIVE",
        tags: JSON.stringify(["Anime", "Summer", "ColorStudy"]),
        createdAt: now
      }
    ])
    .onConflictDoNothing()
    .run();

  // 2. Crear Comprador Demo (Uriel Comprador)
  const buyerId = crypto.randomUUID();
  db.insert(users)
    .values({
      id: buyerId,
      email: "comprador@tupuestito.com",
      passwordHash,
      username: "uriel_fan",
      displayName: "Uriel Comprador 🎨",
      avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80",
      role: "BUYER",
      showNsfw: true,
      createdAt: now
    })
    .onConflictDoNothing()
    .run();

  console.log("✅ Seed completado con éxito!");
  console.log("👉 Artista: maomao@tupuestito.com (Pass: 123456)");
  console.log("👉 Comprador: comprador@tupuestito.com (Pass: 123456)");
}

seed().catch(console.error);

