/**
 * ISO 6346 container number validation.
 *
 * A container number is 11 characters: a 3-letter owner code, a category
 * identifier (U for freight containers, J for detachable equipment, Z for
 * trailers/chassis), 6 digits, and a single check digit — e.g. "MSKU9082341".
 *
 * The check digit is computed by mapping each of the first 10 characters to a
 * numeric value, multiplying by 2^position, summing, and taking the sum mod
 * 11 (a result of 10 maps to a check digit of 0).
 */

const CONTAINER_NUMBER_PATTERN = /^[A-Z]{3}[UJZ]\d{6}\d$/;

// Letter -> numeric value per ISO 6346 Annex A. The sequence skips every
// multiple of 11 (11, 22, 33...), which is why it isn't just A=10, B=11, ...
const LETTER_VALUES: Record<string, number> = {};
{
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let value = 10;
  for (const letter of letters) {
    if (value % 11 === 0) value += 1;
    LETTER_VALUES[letter] = value;
    value += 1;
  }
}

function charValue(ch: string): number {
  return /[0-9]/.test(ch) ? Number(ch) : LETTER_VALUES[ch];
}

export interface ContainerNumberValidation {
  valid: boolean;
  reason?: string;
  normalized?: string;
}

/** Validates (and normalizes) a candidate ISO 6346 container number. */
export function validateContainerNumber(raw: string): ContainerNumberValidation {
  const normalized = (raw || '').trim().toUpperCase().replace(/[\s-]/g, '');

  if (!CONTAINER_NUMBER_PATTERN.test(normalized)) {
    return {
      valid: false,
      reason: 'Must be 11 characters: 3-letter owner code, U/J/Z, 6 digits, 1 check digit (e.g. MSKU9082341)',
    };
  }

  const digits = normalized.slice(0, 10);
  const declaredCheckDigit = Number(normalized[10]);

  const sum = digits
    .split('')
    .reduce((total, ch, index) => total + charValue(ch) * Math.pow(2, index), 0);

  const computedCheckDigit = (sum % 11) % 10;

  if (computedCheckDigit !== declaredCheckDigit) {
    return {
      valid: false,
      reason: `Check digit mismatch: expected ${computedCheckDigit}, got ${declaredCheckDigit}`,
      normalized,
    };
  }

  return { valid: true, normalized };
}

/** Thai highway limit for a standard 6-axle/22-wheel combination. */
export const MAX_GROSS_WEIGHT_KG = 50_500;

export const CONTAINER_SIZE_TYPES = ['20GP', '40GP', '40HC', '40RF'] as const;
export type ContainerSizeType = (typeof CONTAINER_SIZE_TYPES)[number];
