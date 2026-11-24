export type LocaleCode = "en" | "ar" | "fr" | "tr" | "ckb" | "ku";

export interface LocaleMeta {
  code: LocaleCode;
  /** Name of the language written in its own script, shown in the picker. */
  label: string;
  isRTL: boolean;
}

/** Master prompt §15: Arabic + Sorani Kurdish are RTL; Kurmanji is generally LTR. */
export const LOCALES: LocaleMeta[] = [
  { code: "en", label: "English", isRTL: false },
  { code: "ar", label: "العربية", isRTL: true },
  { code: "fr", label: "Français", isRTL: false },
  { code: "tr", label: "Türkçe", isRTL: false },
  { code: "ckb", label: "کوردیی ناوەندی", isRTL: true },
  { code: "ku", label: "Kurdî (Kurmancî)", isRTL: false },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

export function isSupportedLocale(code: string): code is LocaleCode {
  return LOCALES.some((l) => l.code === code);
}

export function localeMeta(code: LocaleCode): LocaleMeta {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}
