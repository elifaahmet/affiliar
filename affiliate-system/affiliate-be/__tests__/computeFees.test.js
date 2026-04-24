"use strict";

const { computeFeesForBucket } = require("../jobs/computeFees");

describe("computeFeesForBucket — partial-mix fee split", () => {
  const baseRates = {
    depositFeePercent: 3,
    withdrawalFeePercent: 2,
    jackpotFeePercent: 0,
    casinoTaxPercent: 0,
    providerFeePercent: 0,
  };

  test("no deposits / no cashouts → zero fees", () => {
    const out = computeFeesForBucket(
      { bets: 0, wins: 0, deposits: 0, cashouts: 0 },
      baseRates,
    );
    expect(out.depositFees).toBe(0);
    expect(out.withdrawalFees).toBe(0);
  });

  test("all deposits unattributed → rate applies to full deposits", () => {
    // 10,000 cents * 3% = 300
    const out = computeFeesForBucket(
      {
        bets: 0, wins: 0,
        deposits: 10000, cashouts: 0,
        depositsFeeAttributed: 0, cashoutsFeeAttributed: 0,
      },
      baseRates,
    );
    expect(out.depositFees).toBe(300);
  });

  test("all deposits attributed → rate skipped entirely", () => {
    // Operator sent feeCents on every deposit; cron must not double-count.
    const out = computeFeesForBucket(
      {
        bets: 0, wins: 0,
        deposits: 10000, cashouts: 0,
        depositsFeeAttributed: 10000, cashoutsFeeAttributed: 0,
      },
      baseRates,
    );
    expect(out.depositFees).toBe(0);
  });

  test("partial mix: half deposits attributed → rate applies only to the other half", () => {
    // deposits=10,000, attributed=4,000 → rate base=6,000, 3% = 180
    const out = computeFeesForBucket(
      {
        bets: 0, wins: 0,
        deposits: 10000, cashouts: 0,
        depositsFeeAttributed: 4000, cashoutsFeeAttributed: 0,
      },
      baseRates,
    );
    expect(out.depositFees).toBe(180);
  });

  test("withdrawal partial mix works the same way", () => {
    // cashouts=8,000, attributed=2,000 → rate base=6,000, 2% = 120
    const out = computeFeesForBucket(
      {
        bets: 0, wins: 0,
        deposits: 0, cashouts: 8000,
        depositsFeeAttributed: 0, cashoutsFeeAttributed: 2000,
      },
      baseRates,
    );
    expect(out.withdrawalFees).toBe(120);
  });

  test("over-attribution (data glitch) clamps to zero instead of negative rate base", () => {
    // attributed > deposits shouldn't happen but if it does we must not
    // produce negative fee rows. Math.max(0, ...) clamps.
    const out = computeFeesForBucket(
      {
        bets: 0, wins: 0,
        deposits: 1000, cashouts: 0,
        depositsFeeAttributed: 5000, cashoutsFeeAttributed: 0,
      },
      baseRates,
    );
    expect(out.depositFees).toBe(0);
  });

  test("rates default to 0 when missing → zero fees even with activity", () => {
    const out = computeFeesForBucket(
      {
        bets: 1000, wins: 500,
        deposits: 10000, cashouts: 5000,
        depositsFeeAttributed: 0, cashoutsFeeAttributed: 0,
      },
      {}, // no rates configured
    );
    expect(out.depositFees).toBe(0);
    expect(out.withdrawalFees).toBe(0);
    expect(out.gameProviderFees).toBe(0);
    expect(out.jackpotFees).toBe(0);
    expect(out.casinoTaxes).toBe(0);
  });

  test("provider GGR clamps to zero when wins > bets (negative would inflate fee)", () => {
    const out = computeFeesForBucket(
      {
        bets: 100, wins: 500,
        deposits: 0, cashouts: 0,
      },
      { ...baseRates, providerFeePercent: 20, casinoTaxPercent: 21 },
    );
    expect(out.gameProviderFees).toBe(0);
    expect(out.casinoTaxes).toBe(0);
  });

  test("all categories compute independently in one call", () => {
    // bets 1000, wins 400 → providerGgr 600
    // providerFee 20% → 120
    // jackpot 1% of bets → 10
    // tax 21% of GGR → 126
    // deposit 3% of 10000 - 2000 = 8000 → 240
    // withdrawal 2% of 5000 - 500 = 4500 → 90
    const out = computeFeesForBucket(
      {
        bets: 1000, wins: 400,
        deposits: 10000, cashouts: 5000,
        depositsFeeAttributed: 2000, cashoutsFeeAttributed: 500,
      },
      {
        depositFeePercent: 3,
        withdrawalFeePercent: 2,
        jackpotFeePercent: 1,
        casinoTaxPercent: 21,
        providerFeePercent: 20,
      },
    );
    expect(out.gameProviderFees).toBe(120);
    expect(out.jackpotFees).toBe(10);
    expect(out.casinoTaxes).toBe(126);
    expect(out.depositFees).toBe(240);
    expect(out.withdrawalFees).toBe(90);
  });
});
