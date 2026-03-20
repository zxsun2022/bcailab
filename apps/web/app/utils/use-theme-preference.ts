import * as React from "react";

const THEME_STORAGE_KEY = "bcailab-theme-preference";

export type ThemePreference = "system" | "light" | "dark";

const getStoredThemePreference = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
};

const applyThemePreference = (preference: ThemePreference) => {
  const resolved =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.resolvedTheme = resolved;
};

export function useThemePreference() {
  const [themePreference, setThemePreference] = React.useState<ThemePreference>("system");

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const preference = getStoredThemePreference();
    setThemePreference(preference);
    applyThemePreference(preference);

    const handleSystemChange = () => {
      if (getStoredThemePreference() === "system") {
        applyThemePreference("system");
      }
    };
    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, []);

  const handleChange = React.useCallback((preference: ThemePreference) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    setThemePreference(preference);
    applyThemePreference(preference);
  }, []);

  return [themePreference, handleChange] as const;
}
