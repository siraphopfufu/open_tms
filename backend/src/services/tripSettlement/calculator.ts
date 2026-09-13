/**
 * Driver advance / trip settlement calculations for Thai container drayage.
 *
 * Expected fuel cost follows this project's reading of the source
 * requirement: distanceKm / kmPerLiter * dieselPrice, with a 10% variance
 * threshold flagging drivers who ran meaningfully over the benchmark.
 * Verify both the formula and the threshold against current company policy
 * before relying on this for real payroll deductions.
 */

export const DEFAULT_KM_PER_LITER = 3.2;
export const OVER_BENCHMARK_THRESHOLD_PERCENT = 10;

export interface FuelBenchmark {
  expectedFuelCostCents: number;
  fuelVariancePercent: number;
  isOverBenchmark: boolean;
}

export function calculateFuelBenchmark(
  distanceKm: number,
  kmPerLiter: number,
  dieselPriceCentsPerLiter: number,
  actualFuelCostCents: number,
): FuelBenchmark {
  const expectedFuelCostCents = Math.round((distanceKm / kmPerLiter) * dieselPriceCentsPerLiter);
  const fuelVariancePercent = expectedFuelCostCents === 0
    ? 0
    : ((actualFuelCostCents - expectedFuelCostCents) / expectedFuelCostCents) * 100;

  return {
    expectedFuelCostCents,
    fuelVariancePercent,
    isOverBenchmark: fuelVariancePercent > OVER_BENCHMARK_THRESHOLD_PERCENT,
  };
}

export interface SettlementTotals {
  totalActualCostCents: number;
  /** advance - actual: positive = driver returns cash, negative = company tops up. */
  netSettlementCents: number;
}

export function calculateSettlementTotals(
  totalAdvanceCents: number,
  actualFuelCostCents: number,
  actualTollCents: number,
  allowanceCents: number,
): SettlementTotals {
  const totalActualCostCents = actualFuelCostCents + actualTollCents + allowanceCents;
  return {
    totalActualCostCents,
    netSettlementCents: totalAdvanceCents - totalActualCostCents,
  };
}
