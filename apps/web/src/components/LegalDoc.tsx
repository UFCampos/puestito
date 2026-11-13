import type { ReactNode } from "react";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Documento legal con índice y secciones numeradas con ancla */
export function LegalDoc({ title, subtitle, sections }: { title: string; subtitle: string; sections: LegalSection[] }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <article className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        <nav aria-label="Índice" className="mt-6 rounded-2xl bg-slate-50 p-4">
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-purple-700 hover:underline">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-700">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-lg font-bold text-slate-900">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-2 space-y-2">{s.body}</div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
