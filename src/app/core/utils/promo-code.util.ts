export const PENDING_PROMO_STORAGE_KEY = 'vamo_pending_promo_code';
export const MAX_PROMO_CODE_LENGTH = 64;

/**
 * Sanitizes an untrusted promo query parameter value.
 * - Strips ASCII control characters
 * - Trims leading/trailing whitespace
 * - Caps length at MAX_PROMO_CODE_LENGTH (64 characters)
 * - Returns null for empty or non-string values
 */
export function sanitizePromoCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return null;
  const limited = cleaned.slice(0, MAX_PROMO_CODE_LENGTH).trim();
  return limited || null;
}

/**
 * Extracts a sanitized `promo` query parameter from a relative or absolute URL string.
 */
export function extractPromoFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return null;
  const queryPart = url.slice(qIndex + 1).split('#')[0];
  try {
    const params = new URLSearchParams(queryPart);
    return sanitizePromoCode(params.get('promo'));
  } catch {
    return null;
  }
}

/**
 * Captures and persists a sanitized promo code into sessionStorage for the current browser tab.
 * Does not overwrite an existing saved code if `raw` is empty or invalid.
 */
export function capturePromoCode(raw: unknown): string | null {
  const sanitized = sanitizePromoCode(raw);
  if (!sanitized) return null;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(PENDING_PROMO_STORAGE_KEY, sanitized);
    } catch {
      // Ignore storage quota/security errors
    }
  }
  return sanitized;
}

/**
 * Reads the currently saved promo code from sessionStorage, sanitized.
 */
export function getSavedPromoCode(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_PROMO_STORAGE_KEY);
    return sanitizePromoCode(raw);
  } catch {
    return null;
  }
}

/**
 * Clears any saved promo code from sessionStorage (e.g. after confirmed checkout or logout).
 */
export function clearSavedPromoCode(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(PENDING_PROMO_STORAGE_KEY);
  } catch {
    // Ignore storage restrictions
  }
}
