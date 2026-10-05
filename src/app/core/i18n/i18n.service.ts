import { Injectable, computed, signal } from '@angular/core';
import { enTranslations } from './translations/en';
import { esTranslations } from './translations/es';

export type SupportedLang = 'en' | 'es';

export const SUPPORTED_LANGS: SupportedLang[] = ['en', 'es'];
export const FALLBACK_LANG: SupportedLang = 'en';
export const LANG_PREF_KEY = 'vamo_lang';
export const LANG_PARAM = 'lang';

const LANG_TO_LOCALE: Record<SupportedLang, string> = {
  en: 'en-US',
  es: 'es',
};

// UI localization is separate from VAMO's content translation workflow.
// Dynamic content translation, Directus translation records, and translation_status
// will be handled in a dedicated Language & Translation Parity project.

// Exact canonical business types from Isla-Labs-DR/vamo-app (onboarding.service.ts).
// Canonical VAMO renders type.label directly for all languages without inventing translations.
export const BUSINESS_TYPES = [
  { value: 'restaurant_and_bar', label: 'Restaurant & Bar' },
  { value: 'restaurant',         label: 'Restaurant' },
  { value: 'bar',                label: 'Bar' },
  { value: 'disco_club',         label: 'Disco / Club' },
  { value: 'bakery',             label: 'Bakery / Café' },
  { value: 'wellness',           label: 'Wellness & Spa' },
  { value: 'car_rental',         label: 'Car Rental' },
  { value: 'excursions',         label: 'Excursions & Tours' },
  { value: 'sports',             label: 'Sports & Outdoor' },
  { value: 'shopping',           label: 'Shopping' },
  { value: 'hair-dresser',       label: 'Hair & Beauty' },
  { value: 'arts_and_culture',   label: 'Art & Culture' },
  { value: 'services',           label: 'Other Services' },
  { value: 'other',              label: 'Other' },
];

export const BUSINESS_TYPE_OPTIONS: Record<SupportedLang, { value: string; label: string }[]> = {
  en: BUSINESS_TYPES,
  es: BUSINESS_TYPES,
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly dictionaries: Record<SupportedLang, Record<string, any>> = {
    en: enTranslations,
    es: esTranslations,
  };

  readonly lang = signal<SupportedLang>(this.detectInitialLang());
  readonly dateLocale = computed(() => LANG_TO_LOCALE[this.lang()]);
  readonly businessTypes = computed(() => BUSINESS_TYPE_OPTIONS[this.lang()]);

  constructor() {
    this.syncHtmlLang(this.lang());
  }

  setLang(lang: SupportedLang): void {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    this.lang.set(lang);
    try {
      localStorage.setItem(LANG_PREF_KEY, lang);
    } catch {
      // Storage access may be restricted
    }
    this.syncHtmlLang(lang);
  }

  t(key: string, params?: Record<string, string | number>): string {
    const current = this.lang();
    let text = this.resolveKey(this.dictionaries[current], key);

    // Fallback to English if missing in chosen language
    if (text === undefined && current !== FALLBACK_LANG) {
      text = this.resolveKey(this.dictionaries[FALLBACK_LANG], key);
    }

    if (text === undefined) {
      return key;
    }

    if (params && typeof text === 'string') {
      text = this.interpolate(text, params);
    }

    return text;
  }

  private resolveKey(dict: Record<string, any>, key: string): string | undefined {
    if (!dict || !key) return undefined;
    const parts = key.split('.');
    let curr: any = dict;
    for (const part of parts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[part];
    }
    return typeof curr === 'string' ? curr : undefined;
  }

  private interpolate(template: string, params: Record<string, string | number>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      return params[key] !== undefined ? String(params[key]) : `{{${key}}}`;
    });
  }

  private detectInitialLang(): SupportedLang {
    // 1. URL query param (?lang=)
    const fromUrl = this.langFromUrl();
    if (fromUrl) {
      try {
        localStorage.setItem(LANG_PREF_KEY, fromUrl);
      } catch {
        // Storage access may be restricted
      }
      return fromUrl;
    }

    // 2. Persisted choice in localStorage ('vamo_lang')
    try {
      const saved = localStorage.getItem(LANG_PREF_KEY);
      if (saved && (saved === 'en' || saved === 'es')) {
        return saved as SupportedLang;
      }
    } catch {
      // Storage access may be restricted
    }

    // 3. Browser language
    try {
      if (typeof navigator !== 'undefined' && navigator.language) {
        const browserCode = navigator.language.toLowerCase().split('-')[0];
        if (browserCode === 'es') {
          return 'es';
        }
      }
    } catch {
      // Navigator might not be available
    }

    // 4. Default fallback
    return FALLBACK_LANG;
  }

  private langFromUrl(): SupportedLang | null {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const params = new URLSearchParams(window.location.search);
        const val = params.get(LANG_PARAM)?.toLowerCase();
        if (val === 'en' || val === 'es') {
          return val as SupportedLang;
        }
      }
    } catch {
      // URL parsing failed
    }
    return null;
  }

  private syncHtmlLang(lang: SupportedLang): void {
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = lang;
      }
    } catch {
      // document not available in non-DOM test environments
    }
  }
}
