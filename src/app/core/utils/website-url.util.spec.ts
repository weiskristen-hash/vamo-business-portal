import {
  WEBSITE_MAX_LENGTH,
  isValidWebsiteUrl,
  normalizeWebsiteForStorage,
} from './website-url.util';

describe('website-url.util', () => {
  describe('isValidWebsiteUrl', () => {
    it('treats empty, null, undefined, and whitespace-only values as valid (optional field)', () => {
      expect(isValidWebsiteUrl('')).toBe(true);
      expect(isValidWebsiteUrl('   ')).toBe(true);
      expect(isValidWebsiteUrl(null)).toBe(true);
      expect(isValidWebsiteUrl(undefined)).toBe(true);
    });

    it('accepts standard website URLs with and without http(s):// matching vamo-app behavior', () => {
      expect(isValidWebsiteUrl('https://example.com')).toBe(true);
      expect(isValidWebsiteUrl('http://example.com')).toBe(true);
      expect(isValidWebsiteUrl('example.com')).toBe(true);
      expect(isValidWebsiteUrl('www.example.com')).toBe(true);
      expect(isValidWebsiteUrl('  https://www.yourbusiness.com/menu?lang=es#drinks  ')).toBe(true);
      expect(isValidWebsiteUrl('booking.kitesurf-dr.do/lessons')).toBe(true);
      expect(isValidWebsiteUrl('https://chiñaco.com')).toBe(true);
    });

    it('enforces the 255-character Directus column limit', () => {
      const prefix = 'https://example.com/';
      const maxValid = prefix + 'a'.repeat(WEBSITE_MAX_LENGTH - prefix.length);
      const tooLong = maxValid + 'b';

      expect(maxValid.length).toBe(255);
      expect(isValidWebsiteUrl(maxValid)).toBe(true);
      expect(tooLong.length).toBe(256);
      expect(isValidWebsiteUrl(tooLong)).toBe(false);
    });

    it('rejects unsafe URL schemes and malformed inputs', () => {
      expect(isValidWebsiteUrl('javascript:alert(1)')).toBe(false);
      expect(isValidWebsiteUrl('  JaVaScRiPt:alert(document.domain)  ')).toBe(false);
      expect(isValidWebsiteUrl('javascript://example.com/%0Aalert(1)')).toBe(false);
      expect(isValidWebsiteUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isValidWebsiteUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false);
      expect(isValidWebsiteUrl('vbscript:msgbox(1)')).toBe(false);
      expect(isValidWebsiteUrl('file:///etc/passwd')).toBe(false);
      expect(isValidWebsiteUrl('ftp://files.example.com')).toBe(false);
      expect(isValidWebsiteUrl('mailto:owner@example.com')).toBe(false);
      expect(isValidWebsiteUrl('//evil.example.com')).toBe(false);
      expect(isValidWebsiteUrl('https://user:pass@example.com')).toBe(false);
      expect(isValidWebsiteUrl('https://')).toBe(false);
      expect(isValidWebsiteUrl('localhost')).toBe(false);
      expect(isValidWebsiteUrl('not a valid url')).toBe(false);
      expect(isValidWebsiteUrl('example..com')).toBe(false);
    });
  });

  describe('normalizeWebsiteForStorage', () => {
    it('returns null when clearing the website field', () => {
      expect(normalizeWebsiteForStorage('')).toBeNull();
      expect(normalizeWebsiteForStorage('   ')).toBeNull();
      expect(normalizeWebsiteForStorage(null)).toBeNull();
      expect(normalizeWebsiteForStorage(undefined)).toBeNull();
    });

    it('preserves valid URLs and bare domains after trimming without unintended mutation', () => {
      expect(normalizeWebsiteForStorage('  https://example.com  ')).toBe('https://example.com');
      expect(normalizeWebsiteForStorage('http://example.com')).toBe('http://example.com');
      expect(normalizeWebsiteForStorage('example.com')).toBe('example.com');
      expect(normalizeWebsiteForStorage('www.example.com')).toBe('www.example.com');
      expect(normalizeWebsiteForStorage('https://booking.example.com/tours?lang=es#top')).toBe(
        'https://booking.example.com/tours?lang=es#top'
      );
    });

    it('throws INVALID_WEBSITE_URL for unsafe or overly long inputs', () => {
      expect(() => normalizeWebsiteForStorage('javascript:alert(1)')).toThrow('INVALID_WEBSITE_URL');
      expect(() => normalizeWebsiteForStorage('data:text/html,evil')).toThrow('INVALID_WEBSITE_URL');
      expect(() => normalizeWebsiteForStorage('https://example.com/' + 'x'.repeat(240))).toThrow(
        'INVALID_WEBSITE_URL'
      );
    });
  });
});
