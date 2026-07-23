import type { MarketState } from "../types";

/** Simple mean-reverting spot with noise — placeholder for real strip later */
export function tickMarket(m: MarketState, dtDays: number): MarketState {
  const mean = 72;
  const pull = (mean - m.spotPrice) * 0.08 * dtDays;
  const shock = (Math.random() - 0.5) * m.volatility * Math.sqrt(dtDays);
  const spot = Math.max(28, Math.min(140, m.spotPrice + pull + shock));
  // Lease-level netback: trucking, treating, quality haircut
  const basis = 4.5 + Math.random() * 1.2;
  const netback = Math.max(10, spot - basis);
  return {
    ...m,
    spotPrice: spot,
    netback,
    day: m.day + dtDays,
  };
}

export function sellOil(
  barrels: number,
  netback: number,
): { revenue: number; sold: number } {
  const sold = Math.max(0, barrels);
  return { sold, revenue: sold * netback };
}
