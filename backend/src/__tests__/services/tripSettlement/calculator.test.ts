import {
  calculateFuelBenchmark,
  calculateSettlementTotals,
  DEFAULT_KM_PER_LITER,
  OVER_BENCHMARK_THRESHOLD_PERCENT,
} from '../../../services/tripSettlement/calculator';

describe('calculateFuelBenchmark', () => {
  it('uses the documented defaults', () => {
    expect(DEFAULT_KM_PER_LITER).toBe(3.2);
    expect(OVER_BENCHMARK_THRESHOLD_PERCENT).toBe(10);
  });

  it('computes expected fuel cost as distance / km-per-litre * diesel price', () => {
    // 320 km at 3.2 km/l = 100 l; 100 l * 32.00 THB = 3,200.00 THB
    const result = calculateFuelBenchmark(320, 3.2, 3200, 320_000);
    expect(result.expectedFuelCostCents).toBe(320_000);
    expect(result.fuelVariancePercent).toBe(0);
    expect(result.isOverBenchmark).toBe(false);
  });

  it('rounds the expected cost to whole satang', () => {
    // 10 km / 3 km/l * 30.01 THB/l = 10,003.33 satang -> 10,003
    expect(calculateFuelBenchmark(10, 3, 3001, 0).expectedFuelCostCents).toBe(10_003);
  });

  it('flags drivers only when strictly more than 10% over the benchmark', () => {
    // Expected 1,000.00 THB (100 km, 1 km/l, 10.00 THB/l); exactly 10% over is 1,100.00
    expect(calculateFuelBenchmark(100, 1, 1000, 110_000).isOverBenchmark).toBe(false);
    expect(calculateFuelBenchmark(100, 1, 1000, 110_001).isOverBenchmark).toBe(true);
  });

  it('reports under-benchmark runs as a negative variance', () => {
    const result = calculateFuelBenchmark(100, 1, 1000, 80_000);
    expect(result.fuelVariancePercent).toBeCloseTo(-20);
    expect(result.isOverBenchmark).toBe(false);
  });

  it('returns zero variance instead of dividing by zero when nothing was expected', () => {
    const result = calculateFuelBenchmark(0, 3.2, 3200, 50_000);
    expect(result.expectedFuelCostCents).toBe(0);
    expect(result.fuelVariancePercent).toBe(0);
    expect(result.isOverBenchmark).toBe(false);
  });
});

describe('calculateSettlementTotals', () => {
  it('sums fuel, tolls and allowance into the actual cost', () => {
    expect(calculateSettlementTotals(500_000, 300_000, 20_000, 30_000).totalActualCostCents).toBe(350_000);
  });

  it('is positive when the driver has advance cash to return', () => {
    expect(calculateSettlementTotals(500_000, 300_000, 20_000, 30_000).netSettlementCents).toBe(150_000);
  });

  it('is negative when the company owes the driver a top-up', () => {
    expect(calculateSettlementTotals(200_000, 300_000, 20_000, 30_000).netSettlementCents).toBe(-150_000);
  });

  it('handles a trip with no advance', () => {
    expect(calculateSettlementTotals(0, 100, 0, 0)).toEqual({ totalActualCostCents: 100, netSettlementCents: -100 });
  });
});
