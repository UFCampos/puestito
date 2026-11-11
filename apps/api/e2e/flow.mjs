import sharp from "sharp";
const API = process.env.API_URL || "http://localhost:4100";
const WEB = "http://localhost:3000";
function client() {
  const cookies = {};
  return async function call(path, { method = "GET", json, form, raw, headers = {}, redirect = "manual" } = {}) {
    const h = { Origin: WEB, ...headers, Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") };
    let body;
    if (json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(json); }
    if (form) body = form;
    if (raw) body = raw;
    const res = await fetch(path.startsWith("http") ? path : API + path, { method, headers: h, body, redirect });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); cookies[kv.slice(0, i)] = kv.slice(i + 1); }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}
const ok = (label, r, expect = 200) => {
  const pass = r.status === expect;
  console.log(`${pass ? "✅" : "❌"} ${label} → ${r.status}${pass ? "" : " " + JSON.stringify(r.data).slice(0, 300)}`);
  if (!pass) process.exitCode = 1;
  return r.data;
};
const png = (w, h, color) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
const fd = (fields, files) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); for (const [k, [buf, name, type]] of Object.entries(files)) f.append(k, new Blob([buf], { type }), name); return f; };

const buyer = client(), artist = client(), stranger = client();
ok("health", await buyer("/health"));
ok("login buyer (username)", await buyer("/api/auth/sign-in/username", { method: "POST", json: { username: "uriel_fan", password: "tupuestito123" } }));
ok("login artist (email)", await artist("/api/auth/sign-in/email", { method: "POST", json: { email: "maomao@tupuestito.com", password: "tupuestito123" } }));
ok("bad password", await client()("/api/auth/sign-in/email", { method: "POST", json: { email: "maomao@tupuestito.com", password: "nope12345" } }), 401);
const me = ok("me buyer", await buyer("/api/me"));
console.log("   buyer:", me.user?.username, me.user?.role);
ok("signup new user", await stranger("/api/auth/sign-up/email", { method: "POST", json: { email: "nuevo@test.com", password: "password123", name: "Nuevo", username: "nuevo_user" } }));
const hack = ok("signup ignores role", await client()("/api/auth/sign-up/email", { method: "POST", json: { email: "hack@test.com", password: "password123", name: "H", username: "hacker", role: "ADMIN" } }));
console.log("   role:", hack.user?.role);

const explore = ok("explore", await buyer("/api/artists/explore?tag=vocaloid"));
console.log("   artists:", explore.artists?.map((a) => a.username));
const prof = ok("artist profile", await buyer("/api/artists/maomao"));
const svc = prof.services.find((s) => s.paymentPlan === "SPLIT_ON_FINAL_PREVIEW");
const svcSketch = prof.services.find((s) => s.paymentPlan === "SPLIT_ON_SKETCH");
console.log("   service:", svc.title, "addons:", svc.addons.length, "slots:", svc.slotsAvailable);

const ref = await png(400, 300, "#ff0080");
const up = ok("presign reference", await buyer("/api/uploads/reference", { method: "POST", json: { contentType: "image/png", size: ref.length } }));
ok("PUT reference", await buyer(up.uploadUrl, { method: "PUT", raw: ref, headers: up.headers }));
ok("presign too big", await buyer("/api/uploads/reference", { method: "POST", json: { contentType: "image/png", size: 6 * 1024 * 1024 } }), 400);

ok("order without terms", await buyer("/api/orders", { method: "POST", json: { serviceId: svc.id, buyerBrief: "Quiero un fullbody de mi OC", referenceKeys: [up.key] } }), 400);
ok("order with foreign ref", await buyer("/api/orders", { method: "POST", json: { serviceId: svc.id, buyerBrief: "Quiero un fullbody de mi OC", referenceKeys: ["refs/otro/x.png"], acceptedTerms: true } }), 400);
const created = ok("create order", await buyer("/api/orders", { method: "POST", json: { serviceId: svc.id, addonIds: [svc.addons[0].id], buyerBrief: "Quiero un fullbody de mi OC con campera violeta", referenceKeys: [up.key], externalBoardUrl: "https://excalidraw.com/#json=abc", acceptedTerms: true } }));
console.log("   order:", created.orderNumber);
const oid = created.id;
let o = ok("get order (buyer)", await buyer(`/api/orders/${oid}`));
console.log("   total", o.order.totalAmount, "deposit", o.order.depositAmount, "final", o.order.finalAmount, "fee", o.order.platformFeeAmount, "refs", o.order.referenceImages.length);
ok("signed ref fetch", await buyer(o.order.referenceImages[0]));
ok("tampered signed url", await buyer(o.order.referenceImages[0].replace(/sig=[^&]+/, "sig=abc")), 403);
ok("stranger cannot see order", await stranger(`/api/orders/${oid}`), 404);
ok("buyer cannot accept", await buyer(`/api/orders/${oid}/accept`, { method: "POST" }), 403);
ok("checkout before accept", await buyer(`/api/orders/${oid}/checkout`, { method: "POST" }), 409);
ok("artist accept", await artist(`/api/orders/${oid}/accept`, { method: "POST" }));
ok("accept twice", await artist(`/api/orders/${oid}/accept`, { method: "POST" }), 409);
ok("sketch before payment", await artist(`/api/orders/${oid}/sketch`, { method: "POST", form: fd({}, { file: [await png(800, 600, "#3366ff"), "s.png", "image/png"] }) }), 409);

let co = ok("checkout deposit", await buyer(`/api/orders/${oid}/checkout`, { method: "POST" }));
ok("mock checkout page (stranger)", await stranger(co.initPoint), 404);
ok("mock checkout page", await buyer(co.initPoint));
ok("mock approve", await buyer("/api/payments/mock-approve", { method: "POST", form: new URLSearchParams({ milestoneId: co.milestoneId, result: "approved" }) }), 302);
ok("mock approve replay", await buyer("/api/payments/mock-approve", { method: "POST", form: new URLSearchParams({ milestoneId: co.milestoneId, result: "approved" }) }), 302);
o = ok("order after deposit", await buyer(`/api/orders/${oid}`));
console.log("   status", o.order.status, "payments", o.payments.map((p) => `${p.stage}:${p.status}:${p.grossAmount}/${p.marketplaceFee}`));

ok("artist sketch (big image)", await artist(`/api/orders/${oid}/sketch`, { method: "POST", form: fd({ watermarkMode: "AUTO_TEXT" }, { file: [await png(3000, 2000, "#3366ff"), "s.png", "image/png"] }) }));
ok("request changes", await buyer(`/api/orders/${oid}/request-changes`, { method: "POST", json: { feedback: "Cambiá la pose" } }));
ok("artist sketch v2 avatar", await artist(`/api/orders/${oid}/sketch`, { method: "POST", form: fd({ watermarkMode: "AUTO_AVATAR" }, { file: [await png(1200, 900, "#22aa66"), "s.png", "image/png"] }) }));
ok("approve sketch", await buyer(`/api/orders/${oid}/approve-sketch`, { method: "POST" }));
ok("deliver final", await artist(`/api/orders/${oid}/deliver-final`, { method: "POST", form: fd({ watermarkMode: "AUTO_TEXT" }, { file: [await png(2400, 2400, "#aa22aa"), "final.png", "image/png"] }) }));
o = ok("order in preview", await buyer(`/api/orders/${oid}`));
console.log("   status", o.order.status, "hasFinalHd", o.order.hasFinalHd, "unlocked", o.order.hdUnlocked);
ok("download HD before pay (buyer)", await buyer(`/api/orders/${oid}/download-hd`), 402);
ok("approve final preview", await buyer(`/api/orders/${oid}/approve-final-preview`, { method: "POST" }));
ok("download HD before pay 2", await buyer(`/api/orders/${oid}/download-hd`), 402);
co = ok("checkout final", await buyer(`/api/orders/${oid}/checkout`, { method: "POST" }));
ok("mock approve final", await buyer("/api/payments/mock-approve", { method: "POST", form: new URLSearchParams({ milestoneId: co.milestoneId, result: "approved" }) }), 302);
o = ok("order completed", await buyer(`/api/orders/${oid}`));
console.log("   status", o.order.status, "payments", o.payments.map((p) => `${p.stage}:${p.status}:${p.grossAmount}/${p.marketplaceFee}`), "sum fee", o.payments.reduce((a, p) => a + p.marketplaceFee, 0), "=", o.order.platformFeeAmount);
const dl = ok("download HD", await buyer(`/api/orders/${oid}/download-hd`));
const hd = await fetch(dl.url); const hdBuf = Buffer.from(await hd.arrayBuffer()); const meta = await sharp(hdBuf).metadata();
console.log(`   HD ${hd.status} ${meta.width}x${meta.height} ${hd.headers.get("content-disposition")}`);
const prev = await fetch(o.order.previewWatermarkedUrl); const pm = await sharp(Buffer.from(await prev.arrayBuffer())).metadata();
console.log(`   preview ${prev.status} ${pm.width}x${pm.height} ${pm.format}`);
await sharp(Buffer.from(await (await fetch(o.order.sketchWatermarkedUrl)).arrayBuffer())).png().toFile("e2e/sketch-preview.png");
ok("review", await buyer(`/api/orders/${oid}/review`, { method: "POST", json: { rating: 5, comment: "Genial" } }));
ok("review twice", await buyer(`/api/orders/${oid}/review`, { method: "POST", json: { rating: 5 } }), 409);
ok("message after complete", await buyer(`/api/orders/${oid}/messages`, { method: "POST", json: { content: "gracias!" } }));

const c2 = ok("order 2", await buyer("/api/orders", { method: "POST", json: { serviceId: svcSketch.id, buyerBrief: "Un icono de mi personaje", acceptedTerms: true } }));
ok("artist reject", await artist(`/api/orders/${c2.id}/reject`, { method: "POST", json: { reason: "Sin cupo" } }));
ok("message on rejected", await buyer(`/api/orders/${c2.id}/messages`, { method: "POST", json: { content: "ok" } }), 409);
ok("artist self order", await artist("/api/orders", { method: "POST", json: { serviceId: svcSketch.id, buyerBrief: "auto pedido de prueba", acceptedTerms: true } }), 400);
const list = ok("list orders", await buyer("/api/orders"));
console.log("   orders:", list.orders?.map((x) => `${x.orderNumber}:${x.status}`));

const portfolioForm = fd({ title: "Nueva obra", tags: "Vocaloid, Miku", rating: "SFW", watermarkMode: "AUTO_TEXT" }, { file: [await png(2000, 1500, "#123456"), "p.png", "image/png"] });
const port = ok("portfolio upload", await artist("/api/artists/portfolio", { method: "POST", form: portfolioForm }));
ok("public image", await stranger(port.imageUrl));
ok("payments status", await artist("/api/payments/status"));
ok("mp connect (mock)", await artist("/api/payments/mp/connect", { method: "POST" }));
ok("profile update", await artist("/api/artists/profile", { method: "PUT", json: { bio: "nueva bio", socialLinks: { twitter: "https://x.com/a" } } }));
ok("profile bad link", await artist("/api/artists/profile", { method: "PUT", json: { socialLinks: { twitter: "javascript:alert(1)" } } }), 400);
ok("create service", await artist("/api/artists/services", { method: "POST", json: { title: "Nuevo servicio", description: "desc", priceArs: 10000, paymentPlan: "FULL_100", turnaroundDays: 5, maxSlots: 1, revisionsIncluded: 1, rating: "SFW", tags: ["chibi"], addons: [{ name: "extra", priceArs: 1000 }] } }));
ok("buyer cannot create service", await buyer("/api/artists/services", { method: "POST", json: {} }), 403);
ok("become artist", await stranger("/api/me/artist-profile", { method: "POST", json: { acceptHumanArtPledge: true } }));
ok("webhook (mock mode ignored)", await client()("/api/payments/webhook", { method: "POST", json: { type: "payment", data: { id: "1" } } }));
ok("CORS foreign origin blocked", await client()("/api/auth/sign-in/email", { method: "POST", json: { email: "x@y.com", password: "12345678" }, headers: { Origin: "https://evil.com" } }), 403);

// ───────── Edición de servicios (extras por id, pausar, borrar) ─────────
ok("public config", await client()("/api/config"));
let mine = ok("my services", await artist("/api/artists/me/services"));
const nuevo = mine.services.find((s) => s.title === "Nuevo servicio");
const addonA = nuevo.addons[0];
const svcBody = { title: "Servicio editado", description: "desc nueva", priceArs: 12000, priceUsd: 10, paymentPlan: "FULL_100", turnaroundDays: 6, maxSlots: 2, revisionsIncluded: 1, rating: "SFW", tags: ["chibi", "emotes"] };
ok("edit service", await artist(`/api/artists/services/${nuevo.id}`, { method: "PUT", json: { ...svcBody, addons: [{ id: addonA.id, name: "extra editado", priceArs: 2000 }, { name: "extra nuevo", priceArs: 500 }] } }));
ok("edit service dup addons", await artist(`/api/artists/services/${nuevo.id}`, { method: "PUT", json: { ...svcBody, addons: [{ name: "x", priceArs: 1 }, { name: "X", priceArs: 2 }] } }), 400);
ok("buyer cannot edit service", await buyer(`/api/artists/services/${nuevo.id}`, { method: "PUT", json: { ...svcBody, addons: [] } }), 403);
mine = ok("my services after edit", await artist("/api/artists/me/services"));
let edited = mine.services.find((s) => s.id === nuevo.id);
const keptId = edited.addons.find((a) => a.name === "extra editado")?.id === addonA.id;
console.log(`   ${keptId && edited.addons.length === 2 && edited.title === "Servicio editado" && edited.priceArs === 12000 ? "✅" : "❌"} addon id conservado, 2 extras, título y precio actualizados`);
if (!(keptId && edited.addons.length === 2)) process.exitCode = 1;
ok("remove one addon", await artist(`/api/artists/services/${nuevo.id}`, { method: "PUT", json: { ...svcBody, addons: [{ id: addonA.id, name: "extra editado", priceArs: 2000 }] } }));
ok("pause service", await artist(`/api/artists/services/${nuevo.id}/status`, { method: "PATCH", json: { isActive: false } }));
const pubPaused = ok("public profile (paused)", await buyer("/api/artists/maomao"));
console.log(`   ${pubPaused.services.some((s) => s.id === nuevo.id) ? "❌" : "✅"} servicio pausado no aparece en el perfil público`);
ok("order on paused service", await buyer("/api/orders", { method: "POST", json: { serviceId: nuevo.id, buyerBrief: "pedido a servicio pausado", acceptedTerms: true } }), 404);
ok("republish service", await artist(`/api/artists/services/${nuevo.id}/status`, { method: "PATCH", json: { isActive: true } }));

// ───────── Entrega final: .zip / .rar, validación de formato y límite de tamaño ─────────
const o3 = ok("order 3 (FULL_100)", await buyer("/api/orders", { method: "POST", json: { serviceId: nuevo.id, addonIds: [addonA.id], buyerBrief: "Pack de emotes para mi canal", acceptedTerms: true } }));
ok("accept 3", await artist(`/api/orders/${o3.id}/accept`, { method: "POST" }));
const co3 = ok("checkout 3", await buyer(`/api/orders/${o3.id}/checkout`, { method: "POST" }));
ok("pay 3", await buyer("/api/payments/mock-approve", { method: "POST", form: new URLSearchParams({ milestoneId: co3.milestoneId, result: "approved" }) }), 302);
ok("sketch 3", await artist(`/api/orders/${o3.id}/sketch`, { method: "POST", form: fd({ watermarkMode: "MANUAL" }, { file: [await png(600, 600, "#445566"), "s.png", "image/png"] }) }));
ok("approve sketch 3", await buyer(`/api/orders/${o3.id}/approve-sketch`, { method: "POST" }));
const zipBytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(2000, 1)]);
const rarBytes = Buffer.concat([Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]), Buffer.alloc(2000, 2)]);
const previewPng = await png(900, 900, "#cc8800");
const deliver = (files) => artist(`/api/orders/${o3.id}/deliver-final`, { method: "POST", form: fd({ watermarkMode: "AUTO_TEXT" }, files) });
ok("deliver .txt disfrazado de .zip", await deliver({ file: [Buffer.from("hola, no soy un zip"), "entrega.zip", "application/zip"], preview: [previewPng, "p.png", "image/png"] }), 400);
ok("deliver .zip sin vista previa", await deliver({ file: [zipBytes, "entrega.zip", "application/zip"] }), 400);
ok("deliver archivo > límite", await deliver({ file: [Buffer.concat([zipBytes, Buffer.alloc(3 * 1024 * 1024, 7)]), "enorme.zip", "application/zip"], preview: [previewPng, "p.png", "image/png"] }), 413);
ok("deliver .rar + vista previa", await deliver({ file: [rarBytes, "pack final.rar", "application/x-rar-compressed"], preview: [previewPng, "p.png", "image/png"] }));
const o3done = ok("order 3 completed", await buyer(`/api/orders/${o3.id}`));
const dl3 = ok("download .rar", await buyer(`/api/orders/${o3.id}/download-hd`));
const rarRes = await fetch(dl3.url); const rarBack = Buffer.from(await rarRes.arrayBuffer());
const rarOk = o3done.order.status === "COMPLETED_HD_UNLOCKED" && rarBack.equals(rarBytes) && /\.rar"$/.test(rarRes.headers.get("content-disposition") ?? "");
console.log(`   ${rarOk ? "✅" : "❌"} .rar íntegro (${rarBack.length} bytes) ${rarRes.headers.get("content-type")} ${rarRes.headers.get("content-disposition")}`);
if (!rarOk) process.exitCode = 1;

const delUsed = ok("delete service with orders → pausa", await artist(`/api/artists/services/${nuevo.id}`, { method: "DELETE" }));
const tmpSvc = ok("create temp service", await artist("/api/artists/services", { method: "POST", json: { ...svcBody, title: "Temporal", addons: [] } }));
const delFresh = ok("delete service without orders", await artist(`/api/artists/services/${tmpSvc.id}`, { method: "DELETE" }));
console.log(`   ${delUsed.paused && !delUsed.deleted && delFresh.deleted ? "✅" : "❌"} con pedidos se pausa, sin pedidos se borra`);
if (!(delUsed.paused && delFresh.deleted)) process.exitCode = 1;
