/**
 * All money is Myanmar kyat (MMK), handled as integer pya (1 kyat = 100 pya) to avoid float errors.
 * Kyat amounts are almost always whole, so display drops the decimals unless there are any.
 */

const DECIMAL = /^\d{1,10}(\.\d{1,2})?$/;

export function toPya(value: string | number): number {
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!DECIMAL.test(s)) throw new Error("Invalid amount");
  const [kyat, frac = ""] = s.split(".");
  return Number(kyat) * 100 + Number(frac.padEnd(2, "0"));
}

/** Format for a Postgres numeric(12,2) column. */
export function toNumeric(pya: number): string {
  const sign = pya < 0 ? "-" : "";
  const abs = Math.abs(pya);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatMMK(pya: number): string {
  return `${(pya / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Ks`;
}

/** Percent strings like "33.33" -> basis points. */
export function percentToBp(percent: string | number): number {
  return Math.round(Number(percent) * 100);
}

/** Split a total across basis-point shares; the last share absorbs rounding so the sum is exact. */
export function splitByBp(total: number, shares: number[]): number[] {
  if (shares.reduce((a, b) => a + b, 0) !== 10000) throw new Error("Shares must add up to 100%");
  const out: number[] = [];
  let used = 0;
  shares.forEach((bp, i) => {
    const part = i === shares.length - 1 ? total - used : Math.floor((total * bp) / 10000);
    out.push(part);
    used += part;
  });
  return out;
}

/**
 * Split a total into n equal parts. Kyat rarely divides cleanly, so the remainder pya go on the
 * earliest parts rather than the last: the student pays the odd pya first and the final month is
 * never the awkward one. The parts always add up to the total exactly.
 */
export function splitEvenly(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("Number of parts must be at least 1");
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Convert a sterling amount at a kyat-per-pound rate, to integer pya. */
export function gbpToPya(gbp: string | number, kyatPerGbp: string | number): number {
  const amount = Number(gbp) * Number(kyatPerGbp);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid exchange");
  return Math.round(amount * 100);
}

export function applyDiscountBp(total: number, discountBp: number): number {
  return total - Math.floor((total * discountBp) / 10000);
}

/** Display only: Postgres numeric text ("15000.00", possibly negative) -> integer pya. */
export function numericToPya(value: string): number {
  return Math.round(Number(value) * 100);
}

export const mmk = (numeric: string) => formatMMK(numericToPya(numeric));
