"use client";

import Link from "next/link";
import { authClient } from "@/lib/api";

const PROVIDERS = (process.env.NEXT_PUBLIC_SOCIAL_PROVIDERS || "")
  .split(",")
  .map((p) => p.trim())
  .filter((p): p is "google" | "discord" => p === "google" || p === "discord");

const LABEL = { google: "Continuar con Google", discord: "Continuar con Discord" } as const;

export function SocialLogin({ next = "/" }: { next?: string }) {
  if (PROVIDERS.length === 0) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="mt-6 space-y-2">
      {PROVIDERS.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() =>
            authClient.signIn.social({
              provider,
              callbackURL: `${origin}${next}`,
              errorCallbackURL: `${origin}/login?error=social`
            })
          }
          className={`w-full rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
            provider === "discord"
              ? "border-indigo-200 bg-indigo-600 text-white hover:bg-indigo-700"
              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          }`}
        >
          {LABEL[provider]}
        </button>
      ))}
      <p className="text-center text-[11px] text-slate-500">
        Al continuar con Google o Discord declarás ser mayor de 18 años y aceptás los{" "}
        <Link href="/terms" target="_blank" className="underline">Términos</Link> y la <Link href="/privacy" target="_blank" className="underline">Política de Privacidad</Link>.
      </p>
      <div className="flex items-center gap-3 pt-2 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> o con tu email <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}
