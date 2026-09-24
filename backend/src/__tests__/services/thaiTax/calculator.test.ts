import { calculateThaiTax, isThaiTaxApplicable, VAT_RATE, WHT_RATE } from '../../../services/thaiTax/calculator';

describe('calculateThaiTax', () => {
  it('uses 7% VAT and 1% WHT', () => {
    expect(VAT_RATE).toBe(0.07);
    expect(WHT_RATE).toBe(0.01);
  });

  it('computes VAT, WHT and the net amount transferred for a round amount', () => {
    // 10,000.00 THB -> VAT 700.00, WHT 100.00, net 10,600.00
    expect(calculateThaiTax(1_000_000)).toEqual({
      subtotalCents: 1_000_000,
      vatCents: 70_000,
      whtCents: 10_000,
      netPayableCents: 1_060_000,
    });
  });

  it('rounds half-up to the nearest satang', () => {
    // 0.50 THB: VAT 3.5 satang -> 4, WHT 0.5 satang -> 1
    expect(calculateThaiTax(50)).toEqual({ subtotalCents: 50, vatCents: 4, whtCents: 1, netPayableCents: 53 });
    // 0.49 THB: VAT 3.43 -> 3, WHT 0.49 -> 0
    expect(calculateThaiTax(49)).toEqual({ subtotalCents: 49, vatCents: 3, whtCents: 0, netPayableCents: 52 });
  });

  it('matches exact integer arithmetic (no floating-point drift) across a wide range', () => {
    for (let s = 0; s <= 200_000; s += 7) {
      const { vatCents, whtCents, netPayableCents } = calculateThaiTax(s);
      expect(vatCents).toBe(Math.floor((s * 7 + 50) / 100));
      expect(whtCents).toBe(Math.floor((s + 50) / 100));
      expect(netPayableCents).toBe(s + vatCents - whtCents);
    }
  });

  it('returns zeros for a zero subtotal', () => {
    expect(calculateThaiTax(0)).toEqual({ subtotalCents: 0, vatCents: 0, whtCents: 0, netPayableCents: 0 });
  });
});

describe('isThaiTaxApplicable', () => {
  it('applies only to THB', () => {
    expect(isThaiTaxApplicable('THB')).toBe(true);
    expect(isThaiTaxApplicable('USD')).toBe(false);
    expect(isThaiTaxApplicable('thb')).toBe(false);
  });
});
