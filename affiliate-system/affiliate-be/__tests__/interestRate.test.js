"use strict";

// This figure lands on a customer's invoice, and the ways it can go wrong are
// quiet: a benchmark used as a daily rate looks like a normal small number, and
// a failed fetch that silently returns 0 charges nothing for months.

describe("annual benchmark becomes a daily rate", () => {
  const load = (env) => {
    jest.resetModules();
    const old = { ...process.env };
    Object.assign(process.env, env);
    const m = require("../utils/interestRate");
    process.env = old;
    return m;
  };

  it("divides the annual rate over 365 days", () => {
    // SOFR 3.65 + 8 margin = 11.68 a year, which is 0.032% a day — not 11.68%.
    const m = load({ BILLING_INTEREST_MARGIN_PERCENT: "8", BILLING_INTEREST_FALLBACK_PERCENT: "3.65" });
    expect(m.dailyPercent()).toBeCloseTo(11.65 / 365, 6);
    expect(m.dailyPercent()).toBeLessThan(0.05);
  });

  it("charges a fraction of a percent per day, not several percent", () => {
    // The failure mode worth a test of its own: using the annual figure
    // directly would charge over 1300% a year and still read as "3.65%".
    const m = load({ BILLING_INTEREST_FALLBACK_PERCENT: "4", BILLING_INTEREST_MARGIN_PERCENT: "8" });
    const yearly = m.dailyPercent() * 365;
    expect(yearly).toBeCloseTo(12, 5);
  });

  it("keeps charging when the benchmark can't be fetched", () => {
    // Nothing cached yet: falls back to a stated level rather than to zero,
    // so an outage at the rates API doesn't quietly waive everyone's interest.
    const m = load({ BILLING_INTEREST_FALLBACK_PERCENT: "4", BILLING_INTEREST_MARGIN_PERCENT: "8" });
    const d = m.describe();
    expect(d.source).toBe("fallback");
    expect(d.dailyPercent).toBeGreaterThan(0);
  });

  it("lets a fixed daily rate override the benchmark entirely", () => {
    const m = load({ BILLING_DAILY_INTEREST_PERCENT: "0.05" });
    expect(m.dailyPercent()).toBe(0.05);
    expect(m.describe().source).toBe("fixed");
  });
});

describe("what an overdue invoice actually costs", () => {
  it("stays in a plausible range for a month of delay", () => {
    jest.resetModules();
    process.env.BILLING_INTEREST_FALLBACK_PERCENT = "4";
    process.env.BILLING_INTEREST_MARGIN_PERCENT = "8";
    const { dailyPercent } = require("../utils/interestRate");
    // $935 unpaid for 30 days at ~12% a year is single-digit dollars. If a
    // change ever makes this hundreds, the conversion broke.
    const owed = 935 * (dailyPercent() / 100) * 30;
    expect(owed).toBeGreaterThan(5);
    expect(owed).toBeLessThan(15);
  });
});
