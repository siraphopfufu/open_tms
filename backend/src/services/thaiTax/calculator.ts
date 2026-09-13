/**
 * Thai VAT/WHT calculation for transport service invoices (Sprint 2).
 *
 * Amounts are integer satang (1/100 baht), matching the cents-based convention
 * used everywhere else in this codebase. Rounding is half-up to the nearest
 * satang, per Revenue Department practice (ป.101/2544).
 *
 * NOTE: this implements this project's reading of the requirements — verify
 * the rates and the WHT applicability rule against current Revenue Department
 * guidance and an accountant's sign-off before relying on it for real filings.
 */

export const VAT_RATE = 0.07;
// Land transport services fall under Section 3 Trez of the Revenue Code.
export const WHT_RATE = 0.01;

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export interface ThaiTaxBreakdown {
  subtotalCents: number;
  vatCents: number;
  whtCents: number;
  /** subtotalCents + vatCents - whtCents — the amount expected by bank transfer. */
  netPayableCents: number;
}

export function calculateThaiTax(subtotalCents: number): ThaiTaxBreakdown {
  const vatCents = roundHalfUp(subtotalCents * VAT_RATE);
  const whtCents = roundHalfUp(subtotalCents * WHT_RATE);
  return {
    subtotalCents,
    vatCents,
    whtCents,
    netPayableCents: subtotalCents + vatCents - whtCents,
  };
}

/** Whether Thai VAT/WHT applies to an invoice — gated on THB currency. */
export function isThaiTaxApplicable(currency: string): boolean {
  return currency === 'THB';
}
