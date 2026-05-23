"use strict";

// Behaviour-preservation tests for the raReward strategy registry. The
// engine/referralQualification.js refactor swapped an inline computeReward
// for a thin wrapper around this registry — the inputs/outputs must match
// the old function bit-for-bit. New strategies (crew_tiered etc.) drop
// here as new describe() blocks when they land.

const { compute } = require("../engine/raReward");
const { computeReward } = require("../engine/referralQualification");

describe("raReward.compute — fixed_bonus", () => {
  test("flat amountCents regardless of FTD size", () => {
    expect(compute({ type: "fixed_bonus", amountCents: 5000 }, { ftdCents: 10_000 })).toBe(5000);
    expect(compute({ type: "fixed_bonus", amountCents: 5000 }, { ftdCents: 100 })).toBe(5000);
  });

  test("missing amountCents → 0", () => {
    expect(compute({ type: "fixed_bonus" }, { ftdCents: 10_000 })).toBe(0);
  });

  test("negative amountCents clamped to 0", () => {
    expect(compute({ type: "fixed_bonus", amountCents: -500 }, {})).toBe(0);
  });
});

describe("raReward.compute — percent_of_first_deposit", () => {
  test("plain percent of FTD", () => {
    // 10% of 10_000 cents = 1000
    expect(compute({ type: "percent_of_first_deposit", percent: 10 }, { ftdCents: 10_000 })).toBe(1000);
  });

  test("cap clips the payout", () => {
    expect(
      compute(
        { type: "percent_of_first_deposit", percent: 50, capCents: 300 },
        { ftdCents: 10_000 },   // 50% would be 5000, capped at 300
      ),
    ).toBe(300);
  });

  test("cap=null and cap=0 both mean uncapped", () => {
    expect(
      compute(
        { type: "percent_of_first_deposit", percent: 50, capCents: null },
        { ftdCents: 10_000 },
      ),
    ).toBe(5000);
    expect(
      compute(
        { type: "percent_of_first_deposit", percent: 50, capCents: 0 },
        { ftdCents: 10_000 },
      ),
    ).toBe(5000);
  });

  test("integer floor (no half cents)", () => {
    // 33% of 333 = 109.89 → 109
    expect(compute({ type: "percent_of_first_deposit", percent: 33 }, { ftdCents: 333 })).toBe(109);
  });
});

describe("raReward.compute — crew_tiered", () => {
  // Default tier table from the operator spec:
  //   3 active → 3%, 5 → 5%, 10 → 8%, 15 → 12%, 20 → 15%, 25 → 18%
  const defaultLevels = [
    { activeReferrals: 3,  percent: 3 },
    { activeReferrals: 5,  percent: 5 },
    { activeReferrals: 10, percent: 8 },
    { activeReferrals: 15, percent: 12 },
    { activeReferrals: 20, percent: 15 },
    { activeReferrals: 25, percent: 18 },
  ];
  const cfg = { type: "crew_tiered", crewLevels: defaultLevels };

  test("below the lowest threshold → no payout (haven't earned the crew yet)", () => {
    expect(compute(cfg, { activeReferralsCount: 0, ngrCents: 100_000 })).toBe(0);
    expect(compute(cfg, { activeReferralsCount: 2, ngrCents: 100_000 })).toBe(0);
  });

  test("exact level boundary picks that level", () => {
    // 3 active = 3% of 100_000 cents = 3000
    expect(compute(cfg, { activeReferralsCount: 3, ngrCents: 100_000 })).toBe(3000);
    // 10 active = 8% of 50_000 = 4000
    expect(compute(cfg, { activeReferralsCount: 10, ngrCents: 50_000 })).toBe(4000);
  });

  test("between levels uses the highest cleared one", () => {
    // 7 active is past 5 (5%) but short of 10 — should use 5%.
    expect(compute(cfg, { activeReferralsCount: 7, ngrCents: 100_000 })).toBe(5000);
    // 24 active uses 20-tier (15%), not 25.
    expect(compute(cfg, { activeReferralsCount: 24, ngrCents: 100_000 })).toBe(15_000);
  });

  test("above the top tier caps at the top tier", () => {
    // 100 active still uses 18% (the top tier).
    expect(compute(cfg, { activeReferralsCount: 100, ngrCents: 100_000 })).toBe(18_000);
  });

  test("zero or negative NGR → no payout", () => {
    expect(compute(cfg, { activeReferralsCount: 25, ngrCents: 0 })).toBe(0);
    expect(compute(cfg, { activeReferralsCount: 25, ngrCents: -500 })).toBe(0);
  });

  test("monthlyCapCents clips the payout", () => {
    const capped = { ...cfg, crewMonthlyCapCents: 1000 };
    // 25 active × 18% × 100k = 18_000 → capped at 1000.
    expect(compute(capped, { activeReferralsCount: 25, ngrCents: 100_000 })).toBe(1000);
  });

  test("unsorted level rows are handled (operator typed them in any order)", () => {
    const unsorted = {
      type: "crew_tiered",
      crewLevels: [
        { activeReferrals: 25, percent: 18 },
        { activeReferrals: 3,  percent: 3 },
        { activeReferrals: 10, percent: 8 },
        { activeReferrals: 5,  percent: 5 },
      ],
    };
    expect(compute(unsorted, { activeReferralsCount: 12, ngrCents: 100_000 })).toBe(8000);
  });

  test("empty crewLevels → 0", () => {
    expect(
      compute({ type: "crew_tiered", crewLevels: [] }, { activeReferralsCount: 50, ngrCents: 100_000 }),
    ).toBe(0);
  });
});

describe("raReward.compute — defensive", () => {
  test("unknown strategy type → 0", () => {
    expect(compute({ type: "match_deposit" }, { ftdCents: 10_000 })).toBe(0);
  });
  test("null / undefined config → 0", () => {
    expect(compute(null, { ftdCents: 10_000 })).toBe(0);
    expect(compute(undefined, { ftdCents: 10_000 })).toBe(0);
  });
});

describe("referralQualification.computeReward — public wrapper still matches", () => {
  test("delegates to the registry with the same numbers as before", () => {
    expect(computeReward({ type: "fixed_bonus", amountCents: 5000 }, 10_000)).toBe(5000);
    expect(computeReward({ type: "percent_of_first_deposit", percent: 10, capCents: 800 }, 10_000)).toBe(800);
  });
});
