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
}

export function useMe(deps: unknown[] = []) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [artistProfile, setArtistProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: MeUser; artistProfile: any }>("/api/me");
      setUser(data.user);
      setArtistProfile(data.artistProfile);
    } catch {
      setUser(null);
      setArtistProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { user, artistProfile, loading, reload };
}
