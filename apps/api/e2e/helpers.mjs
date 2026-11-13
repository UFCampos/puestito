import sharp from "sharp";

export const API = process.env.API_URL || "http://localhost:4100";
export const WEB = "http://localhost:3000";

/** Cliente HTTP con su propio tarro de cookies (una "sesión de navegador") */
export function client() {
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

/** Verifica el código HTTP de una respuesta y devuelve su cuerpo */
export const ok = (label, r, expect = 200) => {
  const pass = r.status === expect;
  console.log(`${pass ? "✅" : "❌"} ${label} → ${r.status}${pass ? "" : " " + JSON.stringify(r.data).slice(0, 300)}`);
  if (!pass) process.exitCode = 1;
  return r.data;
};

/** Verifica una condición sobre datos ya obtenidos */
export const check = (label, condition, detail = "") => {
  console.log(`   ${condition ? "✅" : "❌"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) process.exitCode = 1;
  return condition;
};

export const png = (w, h, color) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();

export const fd = (fields, files) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const [k, [buf, name, type]] of Object.entries(files)) f.append(k, new Blob([buf], { type }), name);
  return f;
};

export const section = (title) => console.log(`\n───────── ${title} ─────────`);
