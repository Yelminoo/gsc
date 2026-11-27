import { describe, expect, it } from "vitest";
import { applyDiscountBp, percentToBp, splitByBp, toNumeric, toPya } from "@/lib/money";

describe("money", () => {
  it("parses decimals exactly and rejects junk", () => {
    expect(toPya("15000")).toBe(1_500_000);
    expect(toPya("0.1")).toBe(10);
    expect(toPya("19.99")).toBe(1999);
    for (const bad of ["-5", "1e3", "1.234", "abc", "", "1,000", " "]) expect(() => toPya(bad)).toThrow();
  });
  it("formats numeric strings", () => {
    expect(toNumeric(1_500_000)).toBe("15000.00");
    expect(toNumeric(5)).toBe("0.05");
  });
  it("splits so the parts always add up to the total", () => {
    const total = 1_500_001;
    const parts = splitByBp(total, [3333, 3333, 3334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    expect(() => splitByBp(100, [5000, 4000])).toThrow();
  });
  it("applies discounts in basis points", () => {
    expect(applyDiscountBp(1_000_000, percentToBp("10"))).toBe(900_000);
  });
});
