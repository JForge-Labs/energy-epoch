import type { PlayerState } from "../types";
import {
  computeCreditLimit,
  FACILITY_APR,
  FINE_BASE,
  FINE_REP_THRESHOLD,
} from "../data/economy";

export function accrueInterest(player: PlayerState, dtDays: number): number {
  const c = player.credit;
  if (c.debt <= 0 || dtDays <= 0) return 0;
  const interest = c.debt * (c.apr / 365) * dtDays;
  player.cash -= interest;
  player.opexToday += interest;
  c.interestPaidToday += interest;
  return interest;
}

export function refreshCreditLimit(player: PlayerState, assetValue: number) {
  player.credit.limit = computeCreditLimit(
    5_000_000,
    player.reputation,
    assetValue,
  );
  // Soft ceiling: cannot sit above limit without forced feel — flag via message in Game
}

export function tryDrawCredit(player: PlayerState, amount: number): string {
  const room = player.credit.limit - player.credit.debt;
  if (amount <= 0) return "Enter a draw amount.";
  if (room <= 0) return "Facility maxed — grow assets/rep or pay down.";
  const draw = Math.min(amount, room);
  player.credit.debt += draw;
  player.cash += draw;
  return `Drew $${draw.toLocaleString()} — debt now $${player.credit.debt.toLocaleString()}.`;
}

export function tryPayDebt(player: PlayerState, amount: number): string {
  if (player.credit.debt <= 0) return "Facility is clear. You're in the green on debt.";
  const pay = Math.min(amount, player.cash, player.credit.debt);
  if (pay <= 0) return "No cash to pay principal.";
  player.cash -= pay;
  player.credit.debt -= pay;
  return `Paid $${pay.toLocaleString()} principal. Debt $${player.credit.debt.toLocaleString()}.`;
}

/** Periodic fines when reputation is in the ditch */
export function tickFines(player: PlayerState, dtDays: number, acc: { t: number }): string | null {
  if (player.reputation >= FINE_REP_THRESHOLD) {
    acc.t = 0;
    return null;
  }
  acc.t += dtDays;
  if (acc.t < 3) return null;
  acc.t = 0;
  const severity = (FINE_REP_THRESHOLD - player.reputation) / FINE_REP_THRESHOLD;
  const fine = Math.floor(FINE_BASE * (1 + severity * 3));
  player.cash -= fine;
  player.opexToday += fine;
  return `Regulatory fine $${fine.toLocaleString()} (rep ${player.reputation.toFixed(0)}).`;
}

export function rollDayCounters(player: PlayerState, day: number) {
  if (Math.floor(day) !== player.credit.dayStamp) {
    player.operatingGreen = player.revenueToday > player.opexToday;
    player.revenueToday = 0;
    player.opexToday = 0;
    player.credit.interestPaidToday = 0;
    player.credit.dayStamp = Math.floor(day);
  }
}

export { FACILITY_APR };
