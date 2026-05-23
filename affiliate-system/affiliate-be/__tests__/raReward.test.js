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

describe("raReward.compute — defensive", () => {
  test("unknown strategy type → 0", () => {
    expect(compute({ type: "crew_tiered" }, { ftdCents: 10_000 })).toBe(0);
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
