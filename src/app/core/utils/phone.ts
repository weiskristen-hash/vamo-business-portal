export function isValidPhone(value: string | null | undefined): boolean {
  if (!value) return false;
  const cleaned = value.trim().replace(/^00/, '+');
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
  return /^\+?[0-9\s\-()]{7,20}$/.test(cleaned);
}
