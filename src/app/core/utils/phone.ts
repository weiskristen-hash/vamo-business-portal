export interface CountryInfo {
  iso2: string;
  nameEn: string;
  nameEs: string;
  dialCode: string;
  flag: string;
  areaCodes?: string[];
  placeholder: string;
}

export const COUNTRIES: CountryInfo[] = [
  {
    iso2: 'DO',
    nameEn: 'Dominican Republic',
    nameEs: 'República Dominicana',
    dialCode: '1',
    flag: '🇩🇴',
    areaCodes: ['809', '829', '849'],
    placeholder: '(809) 555-0123',
  },
  {
    iso2: 'US',
    nameEn: 'United States',
    nameEs: 'Estados Unidos',
    dialCode: '1',
    flag: '🇺🇸',
    placeholder: '(555) 234-5678',
  },
  {
    iso2: 'CA',
    nameEn: 'Canada',
    nameEs: 'Canadá',
    dialCode: '1',
    flag: '🇨🇦',
    placeholder: '(416) 555-0199',
  },
  {
    iso2: 'PR',
    nameEn: 'Puerto Rico',
    nameEs: 'Puerto Rico',
    dialCode: '1',
    flag: '🇵🇷',
    areaCodes: ['787', '939'],
    placeholder: '(787) 555-0123',
  },
  {
    iso2: 'HT',
    nameEn: 'Haiti',
    nameEs: 'Haití',
    dialCode: '509',
    flag: '🇭🇹',
    placeholder: '3456 7890',
  },
  {
    iso2: 'ES',
    nameEn: 'Spain',
    nameEs: 'España',
    dialCode: '34',
    flag: '🇪🇸',
    placeholder: '612 345 678',
  },
  {
    iso2: 'MX',
    nameEn: 'Mexico',
    nameEs: 'México',
    dialCode: '52',
    flag: '🇲🇽',
    placeholder: '55 1234 5678',
  },
  {
    iso2: 'CO',
    nameEn: 'Colombia',
    nameEs: 'Colombia',
    dialCode: '57',
    flag: '🇨🇴',
    placeholder: '300 123 4567',
  },
  {
    iso2: 'FR',
    nameEn: 'France',
    nameEs: 'Francia',
    dialCode: '33',
    flag: '🇫🇷',
    placeholder: '6 12 34 56 78',
  },
  {
    iso2: 'DE',
    nameEn: 'Germany',
    nameEs: 'Alemania',
    dialCode: '49',
    flag: '🇩🇪',
    placeholder: '151 23456789',
  },
  {
    iso2: 'IT',
    nameEn: 'Italy',
    nameEs: 'Italia',
    dialCode: '39',
    flag: '🇮🇹',
    placeholder: '312 345 6789',
  },
  {
    iso2: 'GB',
    nameEn: 'United Kingdom',
    nameEs: 'Reino Unido',
    dialCode: '44',
    flag: '🇬🇧',
    placeholder: '7911 123456',
  },
  {
    iso2: 'AR',
    nameEn: 'Argentina',
    nameEs: 'Argentina',
    dialCode: '54',
    flag: '🇦🇷',
    placeholder: '11 1234 5678',
  },
  {
    iso2: 'BR',
    nameEn: 'Brazil',
    nameEs: 'Brasil',
    dialCode: '55',
    flag: '🇧🇷',
    placeholder: '11 91234-5678',
  },
  {
    iso2: 'CL',
    nameEn: 'Chile',
    nameEs: 'Chile',
    dialCode: '56',
    flag: '🇨🇱',
    placeholder: '9 1234 5678',
  },
  {
    iso2: 'PE',
    nameEn: 'Peru',
    nameEs: 'Perú',
    dialCode: '51',
    flag: '🇵🇪',
    placeholder: '912 345 678',
  },
  {
    iso2: 'VE',
    nameEn: 'Venezuela',
    nameEs: 'Venezuela',
    dialCode: '58',
    flag: '🇻🇪',
    placeholder: '412 1234567',
  },
  {
    iso2: 'JM',
    nameEn: 'Jamaica',
    nameEs: 'Jamaica',
    dialCode: '1',
    flag: '🇯🇲',
    areaCodes: ['876', '658'],
    placeholder: '(876) 555-0123',
  },
  {
    iso2: 'BS',
    nameEn: 'Bahamas',
    nameEs: 'Bahamas',
    dialCode: '1',
    flag: '🇧🇸',
    areaCodes: ['242'],
    placeholder: '(242) 555-0123',
  },
  {
    iso2: 'CU',
    nameEn: 'Cuba',
    nameEs: 'Cuba',
    dialCode: '53',
    flag: '🇨🇺',
    placeholder: '5 1234567',
  },
  {
    iso2: 'CR',
    nameEn: 'Costa Rica',
    nameEs: 'Costa Rica',
    dialCode: '506',
    flag: '🇨🇷',
    placeholder: '8312 3456',
  },
  {
    iso2: 'PA',
    nameEn: 'Panama',
    nameEs: 'Panamá',
    dialCode: '507',
    flag: '🇵🇦',
    placeholder: '6123-4567',
  },
];

export const DEFAULT_COUNTRY: CountryInfo = COUNTRIES[0]; // Dominican Republic

/**
 * Parses any incoming phone string into its matching country and national digits.
 * Preserves legacy input and distinguishes +1 Caribbean/US/CA.
 */
export function parsePhone(value: string | null | undefined): {
  country: CountryInfo;
  nationalNumber: string;
  originalValue: string;
} {
  const originalValue = value ?? '';
  if (!value || !value.trim()) {
    return { country: DEFAULT_COUNTRY, nationalNumber: '', originalValue };
  }

  const cleaned = value.trim().replace(/^00/, '+');
  const digitsOnly = cleaned.replace(/\D/g, '');

  if (cleaned.startsWith('+')) {
    // Check if starts with +1
    if (cleaned.startsWith('+1')) {
      const rest = digitsOnly.substring(1); // digits after +1
      // Check DO area codes: 809, 829, 849
      if (rest.startsWith('809') || rest.startsWith('829') || rest.startsWith('849')) {
        return { country: COUNTRIES.find((c) => c.iso2 === 'DO') || DEFAULT_COUNTRY, nationalNumber: rest, originalValue };
      }
      // Check PR area codes
      if (rest.startsWith('787') || rest.startsWith('939')) {
        return { country: COUNTRIES.find((c) => c.iso2 === 'PR') || DEFAULT_COUNTRY, nationalNumber: rest, originalValue };
      }
      // Check JM area codes
      if (rest.startsWith('876') || rest.startsWith('658')) {
        return { country: COUNTRIES.find((c) => c.iso2 === 'JM') || DEFAULT_COUNTRY, nationalNumber: rest, originalValue };
      }
      // Check BS area codes
      if (rest.startsWith('242')) {
        return { country: COUNTRIES.find((c) => c.iso2 === 'BS') || DEFAULT_COUNTRY, nationalNumber: rest, originalValue };
      }
      // Check CA common area codes or fallback to US / DO
      // Default other +1 to US
      const usCountry = COUNTRIES.find((c) => c.iso2 === 'US') || DEFAULT_COUNTRY;
      return { country: usCountry, nationalNumber: rest, originalValue };
    }

    // Match longer dial codes first (e.g. 509, 506, 507, 34, 52, etc.)
    const sortedCountries = [...COUNTRIES]
      .filter((c) => c.dialCode !== '1')
      .sort((a, b) => b.dialCode.length - a.dialCode.length);

    for (const c of sortedCountries) {
      if (digitsOnly.startsWith(c.dialCode)) {
        return { country: c, nationalNumber: digitsOnly.substring(c.dialCode.length), originalValue };
      }
    }

    // Unknown international dial code fallback to DO with national digits
    return { country: DEFAULT_COUNTRY, nationalNumber: digitsOnly, originalValue };
  }

  // Not starting with +
  // Check if starts with 1 followed by 10 digits (e.g. 18095550123)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    const rest = digitsOnly.substring(1);
    if (rest.startsWith('809') || rest.startsWith('829') || rest.startsWith('849')) {
      return { country: DEFAULT_COUNTRY, nationalNumber: rest, originalValue };
    }
    const usCountry = COUNTRIES.find((c) => c.iso2 === 'US') || DEFAULT_COUNTRY;
    return { country: usCountry, nationalNumber: rest, originalValue };
  }

  // Check if 10 digits starting with 809, 829, 849 (Dominican local without country code)
  if (digitsOnly.length === 10 && (digitsOnly.startsWith('809') || digitsOnly.startsWith('829') || digitsOnly.startsWith('849'))) {
    return { country: DEFAULT_COUNTRY, nationalNumber: digitsOnly, originalValue };
  }

  // Check other countries' dial codes if digits starts with them
  for (const c of COUNTRIES) {
    if (c.dialCode !== '1' && digitsOnly.startsWith(c.dialCode) && digitsOnly.length > c.dialCode.length + 5) {
      return { country: c, nationalNumber: digitsOnly.substring(c.dialCode.length), originalValue };
    }
  }

  // Default to DO with the raw digits
  return { country: DEFAULT_COUNTRY, nationalNumber: digitsOnly, originalValue };
}

/**
 * Formats a country and national digits into standard E.164 string.
 */
export function formatE164(country: CountryInfo, nationalNumber: string): string {
  const digits = nationalNumber.replace(/\D/g, '');
  if (!digits) return '';

  // Avoid doubling the dial code if user pasted it into national number field
  if (digits.startsWith(country.dialCode) && country.dialCode !== '1') {
    return `+${digits}`;
  }

  // For DO (+1), if user typed e.g. 18095551234 in the input
  if (country.dialCode === '1' && digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return `+${country.dialCode}${digits}`;
}

/**
 * Formats phone number into standard WhatsApp wa.me link.
 */
export function getWhatsAppUrl(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = parsePhone(value);
  if (!parsed.nationalNumber) return '';
  const e164 = formatE164(parsed.country, parsed.nationalNumber);
  const digits = e164.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

/**
 * Validates whether a phone number has a valid structure and minimum digits.
 */
export function isValidPhone(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false;
  const parsed = parsePhone(value);
  const digits = parsed.nationalNumber.replace(/\D/g, '');

  if (parsed.country.dialCode === '1') {
    // NANP numbers (DO, US, CA, PR, JM, BS) require 10 digits
    return digits.length === 10;
  }

  // Other international numbers typically range between 7 and 13 digits
  return digits.length >= 7 && digits.length <= 15;
}
