"use client";

import { useEffect, useState } from "react";
import { DEFAULT_APP_CONFIG, fetchAppConfig, type AppConfig } from "./api";

export function useAppConfig(): AppConfig {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  useEffect(() => {
    let alive = true;
    fetchAppConfig().then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}
