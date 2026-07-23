import type { MarketState, WeatherState } from "../types";

export function tickMarket(m: MarketState, dtDays: number): MarketState {
  const oilMean = 72;
  const gasMean = 3.1;
  const oil =
    m.oilPrice +
    (oilMean - m.oilPrice) * 0.06 * dtDays +
    (Math.random() - 0.5) * m.oilVol * Math.sqrt(Math.max(dtDays, 0.001));
  const gas =
    m.gasPrice +
    (gasMean - m.gasPrice) * 0.05 * dtDays +
    (Math.random() - 0.5) * m.gasVol * Math.sqrt(Math.max(dtDays, 0.001));
  return {
    ...m,
    oilPrice: Math.max(25, Math.min(145, oil)),
    gasPrice: Math.max(0.8, Math.min(12, gas)),
    day: m.day + dtDays,
  };
}

export function tickWeather(w: WeatherState, dtHours: number): WeatherState {
  let hoursLeft = w.hoursLeft - dtHours;
  let kind = w.kind;
  let intensity = w.intensity;

  if (hoursLeft <= 0) {
    const roll = Math.random();
    if (roll < 0.72) {
      kind = "clear";
      intensity = 0;
      hoursLeft = 18 + Math.random() * 40;
    } else if (roll < 0.9) {
      kind = "storm";
      intensity = 0.4 + Math.random() * 0.5;
      hoursLeft = 6 + Math.random() * 14;
    } else {
      kind = "lightning_cell";
      intensity = 0.7 + Math.random() * 0.3;
      hoursLeft = 3 + Math.random() * 6;
    }
  }

  return { kind, intensity, hoursLeft };
}

/** Movement speed multiplier under weather */
export function weatherMoveMul(w: WeatherState): number {
  if (w.kind === "clear") return 1;
  if (w.kind === "storm") return 1 - w.intensity * 0.45;
  return 1 - w.intensity * 0.25;
}

/** Drill speed multiplier */
export function weatherDrillMul(w: WeatherState): number {
  if (w.kind === "storm" || w.kind === "lightning_cell") {
    return 1 - w.intensity * 0.55;
  }
  return 1;
}
