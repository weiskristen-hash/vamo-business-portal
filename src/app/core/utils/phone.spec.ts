import { describe, it, expect } from 'vitest';
import {
  parsePhone,
  formatE164,
  isValidPhone,
  getWhatsAppUrl,
  COUNTRIES,
  DEFAULT_COUNTRY,
} from './phone';

describe('Phone Utilities', () => {
  it('defaults to Dominican Republic (+1) for empty or undefined input', () => {
    const resEmpty = parsePhone('');
    expect(resEmpty.country.iso2).toBe('DO');
    expect(resEmpty.country.dialCode).toBe('1');
    expect(resEmpty.nationalNumber).toBe('');

    const resNull = parsePhone(null);
    expect(resNull.country.iso2).toBe('DO');
  });

  it('correctly parses Dominican Republic numbers with +1 and 809/829/849 area codes', () => {
    const res809 = parsePhone('+18095550123');
    expect(res809.country.iso2).toBe('DO');
    expect(res809.nationalNumber).toBe('8095550123');

    const res829 = parsePhone('+1 (829) 555-0123');
    expect(res829.country.iso2).toBe('DO');
    expect(res829.nationalNumber).toBe('8295550123');

    const res849 = parsePhone('+1-849-555-0123');
    expect(res849.country.iso2).toBe('DO');
    expect(res849.nationalNumber).toBe('8495550123');
  });

  it('correctly parses legacy Dominican numbers without country code', () => {
    const res = parsePhone('809-555-0123');
    expect(res.country.iso2).toBe('DO');
    expect(res.nationalNumber).toBe('8095550123');

    const resLeading1 = parsePhone('18095550123');
    expect(resLeading1.country.iso2).toBe('DO');
    expect(resLeading1.nationalNumber).toBe('8095550123');
  });

  it('distinguishes other +1 countries such as US and PR', () => {
    const resUS = parsePhone('+1 (305) 555-0199');
    expect(resUS.country.iso2).toBe('US');
    expect(resUS.nationalNumber).toBe('3055550199');

    const resPR = parsePhone('+1 (787) 555-0123');
    expect(resPR.country.iso2).toBe('PR');
    expect(resPR.nationalNumber).toBe('7875550123');
  });

  it('correctly parses international numbers from Spain, Germany, France, etc.', () => {
    const resES = parsePhone('+34 612 345 678');
    expect(resES.country.iso2).toBe('ES');
    expect(resES.nationalNumber).toBe('612345678');

    const resDE = parsePhone('+49 151 23456789');
    expect(resDE.country.iso2).toBe('DE');
    expect(resDE.nationalNumber).toBe('15123456789');

    const resFR = parsePhone('0033 6 12 34 56 78');
    expect(resFR.country.iso2).toBe('FR');
    expect(resFR.nationalNumber).toBe('612345678');
  });

  it('formats to valid E.164 strings without double prefixes', () => {
    const doCountry = COUNTRIES.find((c) => c.iso2 === 'DO')!;
    expect(formatE164(doCountry, '8095550123')).toBe('+18095550123');
    expect(formatE164(doCountry, '18095550123')).toBe('+18095550123');

    const esCountry = COUNTRIES.find((c) => c.iso2 === 'ES')!;
    expect(formatE164(esCountry, '612345678')).toBe('+34612345678');
    expect(formatE164(esCountry, '34612345678')).toBe('+34612345678');
  });

  it('generates correct wa.me link with digits only', () => {
    expect(getWhatsAppUrl('+1 (809) 555-0123')).toBe('https://wa.me/18095550123');
    expect(getWhatsAppUrl('8095550123')).toBe('https://wa.me/18095550123');
    expect(getWhatsAppUrl('+34 612 345 678')).toBe('https://wa.me/34612345678');
    expect(getWhatsAppUrl('')).toBe('');
  });

  it('validates phone numbers', () => {
    expect(isValidPhone('+18095550123')).toBe(true);
    expect(isValidPhone('8095550123')).toBe(true);
    expect(isValidPhone('+1 305 555 0199')).toBe(true);
    expect(isValidPhone('+34 612 345 678')).toBe(true);

    // Invalid numbers
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('+1809555')).toBe(false); // short DO number
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone(null)).toBe(false);
  });
});
