"use client";

import { useEffect, type ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const storedTheme = window.localStorage.getItem("georank-theme");
    const isDark = storedTheme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  return <>{children}</>;
}
