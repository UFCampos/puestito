import { ImageResponse } from "next/og";

export const alt = "TuPuestito — Comisiones de arte argentino";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #6b21a8, #4338ca)", color: "white" }}>
        <div style={{ fontSize: 110, fontWeight: 800 }}>TuPuestito</div>
        <div style={{ fontSize: 44, marginTop: 20, opacity: 0.9 }}>Comisiones de arte argentino · 100% humano</div>
      </div>
    ),
    size
  );
}
