export const THEME_COOKIE = "terrier_theme";

export type Theme = "light" | "dark" | "system";

export function isTheme(value: string | undefined): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Le thème voyage dans un cookie plutôt que dans localStorage : le serveur pose
 * lui-même data-theme sur <html>, ce qui supprime à la fois le flash de thème
 * clair et le script inline qu'il aurait fallu pour l'éviter.
 */
export function applyThemeInBrowser(theme: Theme): void {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
