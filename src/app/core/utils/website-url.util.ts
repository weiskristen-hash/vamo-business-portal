/**
 * Maximum length of `providers.website` in Directus (`character varying(255)`).
 */
export const WEBSITE_MAX_LENGTH = 255;

/**
 * Validates an optional business website input to match VAMO consumer app (`vamo-app`)
 * `ProviderInfoComponent.websiteUrl()` behavior while blocking unsafe schemes (`javascript:`,
 * `data:`, `vbscript:`, `file:`, etc.), malformed hosts, and inputs exceeding 255 characters.
 *
 * Empty / null / whitespace-only values are valid because `providers.website` is optional.
 */
export function isValidWebsiteUrl(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.length > WEBSITE_MAX_LENGTH) {
    return false;
  }

  // Reject ASCII control characters, internal whitespace, backslashes, or protocol-relative URLs
  if (/[\u0000-\u001F\u007F\s\\]/.test(trimmed) || trimmed.startsWith('//')) {
    return false;
  }

  // If the input starts with a URI scheme (excluding bare `domain.tld:port`), only http:// and https:// are allowed
  const isBareHostWithPort = /^[^/:?#]+\.[a-zA-Z]{2,}:\d+(?:$|[/?#])/.test(trimmed);
  if (!isBareHostWithPort && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    if (!/^https?:\/\//i.test(trimmed)) {
      return false;
    }
  }

  // Construct candidate URL identically to vamo-app's ProviderInfoComponent.websiteUrl()
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // Reject embedded credentials (e.g. https://user:pass@example.com)
  if (parsed.username !== '' || parsed.password !== '') {
    return false;
  }

  const hostname = parsed.hostname;
  if (!hostname || !hostname.includes('.') || hostname.startsWith('.') || hostname.endsWith('.')) {
    return false;
  }

  const labels = hostname.split('.');
  if (
    labels.some(
      (label) => !label || !/^[a-zA-Z0-9-]+$/.test(label) || label.startsWith('-') || label.endsWith('-')
    )
  ) {
    return false;
  }

  const tld = labels[labels.length - 1];
  if (!/^(?:[a-zA-Z]{2,}|xn--[a-zA-Z0-9-]{2,})$/.test(tld)) {
    return false;
  }

  return true;
}

/**
 * Normalizes a business website input for storage in `providers.website`:
 * - Empty / whitespace-only / null -> `null` (clears the stored website value in Directus).
 * - Valid URL or domain -> trimmed string (preserves valid existing URLs without unintended mutation;
 *   VAMO consumer app prepends `https://` and UTM tags at render time when stored without scheme).
 * - Invalid or unsafe URL -> throws `Error('INVALID_WEBSITE_URL')`.
 */
export function normalizeWebsiteForStorage(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (!isValidWebsiteUrl(trimmed)) {
    throw new Error('INVALID_WEBSITE_URL');
  }

  return trimmed;
}
