import { AuthenticationData, AuthenticationStorage } from '@directus/sdk';

export const BUSINESS_AUTH_STORAGE_KEY = 'vamo_business_portal_session';

export function createBrowserAuthStorage(key: string = BUSINESS_AUTH_STORAGE_KEY): AuthenticationStorage {
  return {
    get: async (): Promise<AuthenticationData | null> => {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;

      try {
        const parsed = JSON.parse(raw);
        return parsed as AuthenticationData;
      } catch (err) {
        console.warn('[BrowserAuthStorage] Failed to parse auth session JSON:', err);
        return null;
      }
    },

    set: async (value: AuthenticationData | null): Promise<void> => {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      if (!value) {
        window.localStorage.removeItem(key);
        return;
      }

      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        console.error('[BrowserAuthStorage] Failed to store auth session:', err);
      }
    },
  };
}
