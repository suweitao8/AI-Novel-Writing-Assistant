import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePalette = "ink" | "paper" | "night";
export type ThemeDensity = "comfortable" | "compact";

export interface ThemePreference {
  palette: ThemePalette;
  density: ThemeDensity;
}

const STORAGE_KEY = "ai-novel.theme.preference";
const DEFAULT_PREFERENCE: ThemePreference = {
  palette: "ink",
  density: "comfortable",
};

interface ThemeContextValue extends ThemePreference {
  setPalette: (palette: ThemePalette) => void;
  setDensity: (density: ThemeDensity) => void;
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ThemePreference> | null;
    return {
      palette: value?.palette === "ink" || value?.palette === "paper" || value?.palette === "night" ? value.palette : DEFAULT_PREFERENCE.palette,
      density: value?.density === "comfortable" || value?.density === "compact" ? value.density : DEFAULT_PREFERENCE.density,
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  }, [preference]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    root.dataset.theme = preference.palette;
    root.dataset.density = preference.density;
    root.style.colorScheme = "dark";
  }, [preference.density, preference.palette]);

  const value = useMemo<ThemeContextValue>(() => ({
    ...preference,
    setPalette: (palette) => setPreference((current) => ({ ...current, palette })),
    setDensity: (density) => setPreference((current) => ({ ...current, density })),
    reset: () => setPreference(DEFAULT_PREFERENCE),
  }), [preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme 必须在 ThemeProvider 内使用。");
  return value;
}
