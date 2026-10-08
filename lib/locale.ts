export type Locale = "en" | "zh";

export const LOCALE_COOKIE = "np-locale";

export function readLocale(value: string | undefined): Locale {
  return value === "zh" ? "zh" : "en";
}
