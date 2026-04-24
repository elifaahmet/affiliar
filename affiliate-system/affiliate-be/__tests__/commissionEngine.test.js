"use strict";

const { calculate } = require("../engine/commissionEngine");

// ── helpers ────────────────────────────────────────────────────────────────────

/** Build a revshare plan */
const revshare = (metric, rate, includePaymentFees) => ({
  type: "revshare",
  revshare: { metric, rate, includePaymentFees },
});

/** Build a CPA plan */
const cpa = (amountCents) => ({ type: "cpa", cpa: { amountCents, currency: "EUR" } });

/** Build a hybrid plan */
const hybrid = (metric, rate, amountCents) => ({
  type: "hybrid",
  revshare: { metric, rate },
  cpa: { amountCents, currency: "EUR" },
});

/** Build a tiered revshare plan */
const tiered = (tiers) => ({ type: "tiered_revshare", tiers });

// ── Revshare ───────────────────────────────────────────────────────────────────

describe("revshare on NGR", () => {
  const plan = revshare("ngr", 30); // 30% of NGR

  test("normal NGR → 30%", () => {
    // NGR = €1000 (100_000 cents) → commission = €300 (30_000 cents)
    const result = calculate(plan, { ngrCents: 100_000, ggrCents: 120_000, ftdCount: 5 });
    expect(result.revshareAmountCents).toBe(30_000);
    expect(result.cpaAmountCents).toBe(0);
    expect(result.totalCents).toBe(30_000);
  });

  test("negative NGR → clamped to 0", () => {
    // Player wins more than they bet — affiliate earns nothing, doesn't owe money
    const result = calculate(plan, { ngrCents: -50_000, ggrCents: -50_000, ftdCount: 2 });
    expect(result.revshareAmountCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });

  test("zero NGR → 0", () => {
    const result = calculate(plan, { ngrCents: 0, ggrCents: 0, ftdCount: 0 });
    expect(result.revshareAmountCents).toBe(0);
  });

  test("floors fractional cents", () => {
    // NGR = 1 cent, 30% = 0.3 → floor → 0
    const result = calculate(plan, { ngrCents: 1, ggrCents: 1, ftdCount: 0 });
    expect(result.revshareAmountCents).toBe(0);
  });

  test("large NGR", () => {
    // NGR = €50000 (5_000_000 cents), 30% = €15000 (1_500_000 cents)
    const result = calculate(plan, { ngrCents: 5_000_000, ggrCents: 5_500_000, ftdCount: 100 });
    expect(result.revshareAmountCents).toBe(1_500_000);
  });
});

describe("revshare on GGR", () => {
  const plan = revshare("ggr", 25); // 25% of GGR

  test("uses GGR not NGR", () => {
    // GGR = €2000 (200_000 cents), NGR = €1500 (150_000 cents)
    // Should use GGR: 25% of 200_000 = 50_000 cents
    const result = calculate(plan, { ggrCents: 200_000, ngrCents: 150_000, ftdCount: 3 });
    expect(result.revshareAmountCents).toBe(50_000);
  });

  test("negative GGR is clamped to 0", () => {
    const result = calculate(plan, { ggrCents: -10_000, ngrCents: -15_000, ftdCount: 0 });
    expect(result.revshareAmountCents).toBe(0);
  });
});

// ── CPA ────────────────────────────────────────────────────────────────────────

describe("CPA", () => {
  const plan = cpa(5000); // €50 per FTD

  test("5 FTDs → 5 × €50", () => {
    const result = calculate(plan, { ngrCents: 0, ggrCents: 0, ftdCount: 5 });
    expect(result.cpaAmountCents).toBe(25_000);
    expect(result.revshareAmountCents).toBe(0);
    expect(result.totalCents).toBe(25_000);
  });

  test("0 FTDs → 0", () => {
    const result = calculate(plan, { ngrCents: 500_000, ggrCents: 600_000, ftdCount: 0 });
    expect(result.cpaAmountCents).toBe(0);
  });

  test("100 FTDs → correct total", () => {
    // 100 × €50 = €5000 (500_000 cents)
    const result = calculate(plan, { ngrCents: 0, ggrCents: 0, ftdCount: 100 });
    expect(result.cpaAmountCents).toBe(500_000);
  });

  test("negative ftdCount treated as 0", () => {
    const result = calculate(plan, { ngrCents: 0, ggrCents: 0, ftdCount: -3 });
    expect(result.cpaAmountCents).toBe(0);
  });
});

// ── Hybrid ─────────────────────────────────────────────────────────────────────

describe("hybrid (revshare + CPA)", () => {
  // 25% NGR revshare + €30 per FTD
  const plan = hybrid("ngr", 25, 3000);

  test("both components add up", () => {
    // NGR = €1000 (100_000 cents) → revshare = €250 (25_000 cents)
    // 4 FTDs × €30 (3000 cents) = €120 (12_000 cents)
    // total = €370 (37_000 cents)
    const result = calculate(plan, { ngrCents: 100_000, ggrCents: 110_000, ftdCount: 4 });
    expect(result.revshareAmountCents).toBe(25_000);
    expect(result.cpaAmountCents).toBe(12_000);
    expect(result.totalCents).toBe(37_000);
  });

  test("negative NGR still gets CPA", () => {
    // Revshare clamped to 0, CPA still pays out
    const result = calculate(plan, { ngrCents: -50_000, ggrCents: -40_000, ftdCount: 2 });
    expect(result.revshareAmountCents).toBe(0);
    expect(result.cpaAmountCents).toBe(6_000);
    expect(result.totalCents).toBe(6_000);
  });
});

// ── Tiered revshare ────────────────────────────────────────────────────────────

describe("tiered_revshare", () => {
  // Standard tier structure:
  //   €0    – €999    → 20%
  //   €1000 – €4999   → 25%
  //   €5000+          → 35%
  const plan = tiered([
    { fromCents:       0, toCents:  99_900, rate: 20 },
    { fromCents: 100_000, toCents: 499_900, rate: 25 },
    { fromCents: 500_000, toCents:    null, rate: 35 },
  ]);

  test("NGR in first tier → 20%", () => {
    // NGR = €500 (50_000 cents) → 20% = €100 (10_000 cents)
    const result = calculate(plan, { ngrCents: 50_000, ggrCents: 60_000, ftdCount: 1 });
    expect(result.revshareAmountCents).toBe(10_000);
  });

  test("NGR in middle tier → 25%", () => {
    // NGR = €2000 (200_000 cents) → 25% = €500 (50_000 cents)
    const result = calculate(plan, { ngrCents: 200_000, ggrCents: 220_000, ftdCount: 5 });
    expect(result.revshareAmountCents).toBe(50_000);
  });

  test("NGR in top tier → 35%", () => {
    // NGR = €10000 (1_000_000 cents) → 35% = €3500 (350_000 cents)
    const result = calculate(plan, { ngrCents: 1_000_000, ggrCents: 1_100_000, ftdCount: 20 });
    expect(result.revshareAmountCents).toBe(350_000);
  });

  test("NGR exactly at tier boundary → uses higher tier", () => {
    // NGR = €1000 exactly (100_000 cents) → should hit middle tier (25%)
    const result = calculate(plan, { ngrCents: 100_000, ggrCents: 110_000, ftdCount: 3 });
    expect(result.revshareAmountCents).toBe(25_000); // 25% of 100_000
  });

  test("negative NGR → clamped to 0, no commission", () => {
    const result = calculate(plan, { ngrCents: -200_000, ggrCents: -150_000, ftdCount: 5 });
    expect(result.revshareAmountCents).toBe(0);
  });

  test("NGR above all toCents bounds → top tier (toCents = null)", () => {
    // NGR = €100k (10_000_000 cents) → 35%
    const result = calculate(plan, { ngrCents: 10_000_000, ggrCents: 10_500_000, ftdCount: 50 });
    expect(result.revshareAmountCents).toBe(3_500_000);
  });

  test("empty tiers → 0", () => {
    const emptyPlan = tiered([]);
    const result = calculate(emptyPlan, { ngrCents: 500_000, ggrCents: 600_000, ftdCount: 10 });
    expect(result.revshareAmountCents).toBe(0);
  });

  test("NGR falls in gap between tiers → 0", () => {
    // Tiers only cover €0–€999 and €5000+, gap in between
    const gappedPlan = tiered([
      { fromCents:       0, toCents:  99_900, rate: 20 },
      { fromCents: 500_000, toCents:    null, rate: 35 },
    ]);
    // NGR = €2000 (200_000) → no matching tier
    const result = calculate(gappedPlan, { ngrCents: 200_000, ggrCents: 220_000, ftdCount: 3 });
    expect(result.revshareAmountCents).toBe(0);
  });
});

// ── Unknown plan type ──────────────────────────────────────────────────────────

describe("unknown plan type", () => {
  test("throws an error", () => {
    expect(() =>
      calculate({ type: "mystery" }, { ngrCents: 100, ggrCents: 100, ftdCount: 1 })
    ).toThrow("Unknown commission plan type: mystery");
  });
});

// ── Real-world scenario ────────────────────────────────────────────────────────

describe("real-world scenario", () => {
  test("month with mixed positive/negative days (net positive NGR)", () => {
    // Affiliate has 30% NGR revshare
    // Month total: NGR = €3,450 (345_000 cents) after CH aggregation
    // Some days negative, but ClickHouse SUM is what we pass in — engine only sees the aggregate
    const plan = revshare("ngr", 30);
    const result = calculate(plan, {
      ngrCents: 345_000,
      ggrCents: 400_000,
      ftdCount: 8,
    });
    // 30% of €3450 = €1035 → 103_500 cents
    expect(result.revshareAmountCents).toBe(103_500);
    expect(result.totalCents).toBe(103_500);
  });

  test("hybrid: affiliate brought many FTDs but negative NGR month", () => {
    // Common: new player month — lots of welcome bonuses eat NGR
    // 20% NGR + €25 CPA
    const plan = hybrid("ngr", 20, 2500);
    const result = calculate(plan, {
      ngrCents: -80_000, // casino lost money this month on these players
      ggrCents: 50_000,
      ftdCount: 12,
    });
    // Revshare: 0 (negative NGR clamped)
    // CPA: 12 × €25 = €300 (30_000 cents)
    expect(result.revshareAmountCents).toBe(0);
    expect(result.cpaAmountCents).toBe(30_000);
    expect(result.totalCents).toBe(30_000);
  });
});

// ── Inherit + payment-fee flag ─────────────────────────────────────────────────

describe("revshare — includePaymentFees flag and operator-default inherit", () => {
  const metrics = {
    ggrCents:               200_000,
    ngrCents:               100_000, // already net of all fees in the view
    depositFeesCents:         5_000,
    withdrawalFeesCents:      2_000,
    paymentSystemFeesCents:   3_000,
    ftdCount:                     0,
  };

  test("includePaymentFees=true → standard NGR base (no add-back)", () => {
    const plan = revshare("ngr", 30, true);
    const result = calculate(plan, metrics);
    // 30% of 100_000 = 30_000
    expect(result.revshareAmountCents).toBe(30_000);
    expect(result.resolvedSettings.ngrIncludesPaymentFees).toBe(true);
  });

  test("includePaymentFees=false → fees added back to NGR before %", () => {
    const plan = revshare("ngr", 30, false);
    const result = calculate(plan, metrics);
    // grossNgr = 100_000 + 5_000 + 2_000 + 3_000 = 110_000
    // 30% of 110_000 = 33_000
    expect(result.revshareAmountCents).toBe(33_000);
    expect(result.resolvedSettings.ngrIncludesPaymentFees).toBe(false);
  });

  test("metric='ggr' overrides includePaymentFees entirely (GGR has no fee deduction)", () => {
    const plan = revshare("ggr", 30, false);
    const result = calculate(plan, metrics);
    // GGR = 200_000, 30% = 60_000
    expect(result.revshareAmountCents).toBe(60_000);
  });

  test("null metric + null includePaymentFees → inherits operator default (ngr, true)", () => {
    const plan = revshare(null, 30, null);
    const opDefaults = { revshareMetric: "ngr", ngrIncludesPaymentFees: true };
    const result = calculate(plan, metrics, opDefaults);
    expect(result.revshareAmountCents).toBe(30_000);
    expect(result.resolvedSettings.revshareMetric).toBe("ngr");
    expect(result.resolvedSettings.ngrIncludesPaymentFees).toBe(true);
  });

  test("null plan fields + operator 'ggr' default → 30% of GGR", () => {
    const plan = revshare(null, 30, null);
    const opDefaults = { revshareMetric: "ggr" };
    const result = calculate(plan, metrics, opDefaults);
    expect(result.revshareAmountCents).toBe(60_000); // 30% × 200_000
  });

  test("null plan fields + operator ngrIncludesPaymentFees=false → fees added back", () => {
    const plan = revshare(null, 30, null);
    const opDefaults = { revshareMetric: "ngr", ngrIncludesPaymentFees: false };
    const result = calculate(plan, metrics, opDefaults);
    expect(result.revshareAmountCents).toBe(33_000); // 30% × 110_000
  });

  test("plan override wins over operator default", () => {
    const plan = revshare("ggr", 30, null); // explicit 'ggr'
    const opDefaults = { revshareMetric: "ngr", ngrIncludesPaymentFees: true };
    const result = calculate(plan, metrics, opDefaults);
    expect(result.revshareAmountCents).toBe(60_000); // GGR path wins
  });
});
