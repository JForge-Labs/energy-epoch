/** Simple cash-flow ledger for playtest auditing */

export type LedgerKind =
  | "interest"
  | "fine"
  | "drill"
  | "explore"
  | "capex"
  | "opex"
  | "revenue"
  | "draw"
  | "debt_pay"
  | "cleanup"
  | "other";

export interface LedgerEntry {
  day: number;
  kind: LedgerKind;
  label: string;
  amount: number; // signed: + in, - out
}

export class Ledger {
  entries: LedgerEntry[] = [];
  private max = 80;

  push(day: number, kind: LedgerKind, label: string, amount: number) {
    if (Math.abs(amount) < 0.5) return;
    this.entries.unshift({ day, kind, label, amount });
    if (this.entries.length > this.max) this.entries.length = this.max;
  }

  recent(n = 12): LedgerEntry[] {
    return this.entries.slice(0, n);
  }
}
