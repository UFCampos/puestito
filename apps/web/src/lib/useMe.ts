"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";

export interface MeUser {
  id: string;
  email: string;
  name: string;
  username: string;
  image: string | null;
  role: "BUYER" | "ARTIST" | "ADMIN";
  showNsfw: boolean;
  emailVerified: boolean;
  /** Cuenta suspendida por moderación: solo lectura */
  suspended: boolean;
  suspensionReason: string | null;
}

export function useMe(deps: unknown[] = []) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [artistProfile, setArtistProfile] = useState<any>(null);
  /** Pedidos que piden atención: le toca actuar, hay un reclamo o mensajes sin leer */
  const [attention, setAttention] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: MeUser; artistProfile: any; attention?: number }>("/api/me");
      setUser(data.user);
      setArtistProfile(data.artistProfile);
      setAttention(data.attention ?? 0);
    } catch {
      setUser(null);
      setArtistProfile(null);
      setAttention(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { user, artistProfile, attention, loading, reload };
}
