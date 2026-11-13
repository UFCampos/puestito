"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="es-AR">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "80px 16px" }}>
        <h1>Algo salió mal</h1>
        <p>Probá recargar la página en un momento.</p>
        <button type="button" onClick={reset}>Reintentar</button>
      </body>
    </html>
  );
}
