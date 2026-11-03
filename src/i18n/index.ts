/**
 * Tiny i18n layer: one dictionary per language (./ko.ts is the source), the
 * current language in a zustand store, and t() to look strings up.
 *
 * Components call useT() so they re-render when the language changes; plain
 * functions (formatters, actions) can call t() directly.
 */
import { create } from "zustand";
import { ko, type Messages } from "./ko";
import { en } from "./en";
import { ja } from "./ja";
import { zhCN } from "./zh-CN";

export type Locale = "ko" | "en" | "ja" | "zh-CN";
/** what's stored in settings: a fixed language, or follow the OS */
export type LanguageSetting = "system" | Locale;

/** shown in the language menu, each in its own language */
export const LANGUAGES: { id: Locale; name: string }[] = [
  { id: "ko", name: "한국어" },
  { id: "en", name: "English" },
  { id: "ja", name: "日本語" },
  { id: "zh-CN", name: "简体中文" },
];

const DICTS: Record<Locale, Messages> = { ko, en, ja, "zh-CN": zhCN };

/** OS language (Electron reports it as navigator.language) mapped to a supported one */
export function systemLocale(lang: string = navigator.language): Locale {
  const l = lang.toLowerCase();
  if (l.startsWith("ko")) return "ko";
  if (l.startsWith("ja")) return "ja";
  if (l.startsWith("zh")) return "zh-CN";
  return "en";
}

export function resolveLocale(setting: LanguageSetting | null | undefined): Locale {
  return !setting || setting === "system" ? systemLocale() : setting;
}

const useLocaleStore = create<{ locale: Locale }>(() => ({ locale: systemLocale() }));
document.documentElement.lang = useLocaleStore.getState().locale;

/** switch the UI language; also sets <html lang> so CJK text picks the right font */
export function applyLanguage(setting: LanguageSetting | null | undefined): void {
  const locale = resolveLocale(setting);
  document.documentElement.lang = locale;
  useLocaleStore.setState({ locale });
}

export function currentLocale(): Locale {
  return useLocaleStore.getState().locale;
}

export type MessageKey = keyof Messages;
type Args<K extends MessageKey> = Messages[K] extends (...args: infer A) => string ? A : [];

export function t<K extends MessageKey>(key: K, ...args: Args<K>): string {
  const entry: unknown = DICTS[currentLocale()][key];
  return typeof entry === "function" ? entry(...args) : (entry as string);
}

/** subscribe the calling component to language changes; returns t */
export function useT(): typeof t {
  useLocaleStore((s) => s.locale);
  return t;
}

export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale);
}
