import { getLocales } from "expo-localization";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nManager } from "react-native";

import { getAppState, setLanguage as persistLanguage } from "@/db/repositories/appStateRepository";

import { DEFAULT_LOCALE, isSupportedLocale, localeMeta, type LocaleCode } from "./locales";
import ar from "./translations/ar";
import ckb from "./translations/ckb";
import en, { type TranslationShape } from "./translations/en";
import fr from "./translations/fr";
import ku from "./translations/ku";
import tr from "./translations/tr";

/**
 * **One layout direction, in every language** (2026-10-07).
 *
 * Arabic and Kurdish Sorani are right-to-left languages, and this app used to
 * mirror its whole layout for them through `I18nManager.forceRTL`. Every
 * direction defect in the category navigation traced back to that, and not by
 * coincidence — mirroring creates three clocks that have to agree and cannot:
 *
 *   - the **locale**, which flips the instant a language is chosen;
 *   - the **layout**, which Android only flips when the activity is recreated,
 *     so it lags the locale until the next launch;
 *   - **measured geometry** — scroll offsets and `onLayout` positions — which
 *     is physical and counts up from the left whichever way the content runs.
 *
 * A gesture has to agree with all three at once. Between choosing Arabic and
 * restarting, a drag selected the category on the far side of the one it
 * pointed at; after restarting, the chip strip ran one way while its own
 * scroll offsets ran the other, so it reached a boundary and jammed.
 *
 * The owner asked for one fixed direction in every language, Kurdish included,
 * rather than another round of patches. So the layout is pinned here, before
 * any component renders, and nothing in the app branches on it again.
 *
 * **This is the layout only.** Arabic and Kurdish text still renders
 * right-to-left: that is the direction of the text run itself, decided by the
 * characters, and `I18nManager` has no say in it. What no longer flips is
 * rows, padding, and which edge things align to.
 *
 * Android remembers the last value natively, so a device that has already
 * flipped needs one more launch to come back. That is the same constraint the
 * old restart prompt existed for, and it now costs one launch once rather than
 * one on every language change.
 */
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

const TRANSLATIONS: Record<LocaleCode, TranslationShape> = { en, ar, fr, tr, ckb, ku };

type Namespace = keyof TranslationShape;
type TFunction = <N extends Namespace>(
  namespace: N,
  key: keyof TranslationShape[N],
  params?: Record<string, string | number>
) => string;

interface I18nContextValue {
  locale: LocaleCode;
  isRTL: boolean;
  setLocale: (code: LocaleCode) => Promise<void>;
  t: TFunction;
  /**
   * The full raw translation table for the current locale — an escape
   * hatch for content `t()` can't serve, since `t()` is string-only
   * (`translate()` always calls `interpolate()`, which requires a string).
   * Needed for structured content like the legal screen's sectioned terms
   * (an array of `{heading, body: string[]}` per section), which has no
   * sane flat-key representation.
   */
  strings: TranslationShape;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectDeviceLocale(): LocaleCode {
  for (const l of getLocales()) {
    if (isSupportedLocale(l.languageCode ?? "")) return l.languageCode as LocaleCode;
  }
  return DEFAULT_LOCALE;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

function translate<N extends Namespace>(
  locale: LocaleCode,
  namespace: N,
  key: keyof TranslationShape[N],
  params?: Record<string, string | number>
): string {
  const table = TRANSLATIONS[locale] ?? en;
  const nsTable = table[namespace] as Record<string, string>;
  const raw = nsTable[key as string] ?? (en[namespace] as Record<string, string>)[key as string];
  return interpolate(raw, params);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);

  useEffect(() => {
    getAppState().then((state) => {
      const resolved = state.language && isSupportedLocale(state.language) ? state.language : detectDeviceLocale();
      setLocaleState(resolved);
      if (!state.language) persistLanguage(resolved).catch(() => {});
    });
  }, []);

  const isRTL = localeMeta(locale).isRTL;

  async function setLocale(code: LocaleCode) {
    await persistLanguage(code);
    setLocaleState(code);

    /*
      **No restart, because nothing about the layout changes any more.**

      This used to call `I18nManager.forceRTL` and then ask for a restart,
      because Android only applies a layout direction when the activity is
      recreated. Every direction bug in the category navigation came out of
      that one line: between choosing Arabic and restarting, the locale said
      right-to-left while the layout was still left-to-right, so a gesture
      and the strip it drove disagreed about which way "next" was. After the
      restart they agreed again — and disagreed with measured scroll offsets
      instead, which are physical and count up whichever way the chips run.

      The owner asked for one direction in every language, Kurdish included
      (2026-10-07). So the layout no longer moves at all: the pinning at the
      top of this file is permanent, a language change is now only a change
      of words, and there is nothing left to restart for.

      Arabic and Kurdish text still renders right-to-left — that is the text
      run's own direction and has nothing to do with `I18nManager`. What no
      longer flips is the *layout*: rows, padding and alignment.
    */
  }

  const value = useMemo<I18nContextValue>(() => {
    const t: TFunction = (namespace, key, params) => translate(locale, namespace, key, params);
    const strings = TRANSLATIONS[locale] ?? en;
    return { locale, isRTL, setLocale, t, strings };
  }, [locale, isRTL]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
