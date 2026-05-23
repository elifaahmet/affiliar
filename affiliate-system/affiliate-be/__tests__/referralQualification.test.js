"use strict";

const { evaluateGates } = require("../engine/referralQualification");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ftdEvent = {
  ftdCents: 10_000,                          // €100
  ftdAt: new Date(Date.now() - 30 * MS_PER_DAY), // 30 days ago
  wagerSinceFtdCents: 1_000_000,             // wagered plenty
};

const OFF = {
  minDepositCents: 0,
  holdDays: 0,
  minWagerCents: 0,
  minWagerMultiple: 0,
  minActiveDeposits: 0,
  minAccountAgeDays: 0,
  requirePositiveNgr: false,
};

describe("evaluateGates — legacy gates still work", () => {
  test("no gates active → qualified", () => {
    expect(evaluateGates({ ...ftdEvent, gates: OFF }).decision).toBe("qualified");
  });

  test("minDeposit not met → rejected", () => {
    const r = evaluateGates({ ...ftdEvent, ftdCents: 500, gates: { ...OFF, minDepositCents: 1000 } });
    expect(r.decision).toBe("rejected");
    expect(r.reason).toBe("min_deposit_not_met");
  });

  test("holdDays not elapsed → pending", () => {
    const r = evaluateGates({
      ...ftdEvent,
      ftdAt: new Date(Date.now() - 2 * MS_PER_DAY),
      gates: { ...OFF, holdDays: 7 },
    });
    expect(r.decision).toBe("pending");
    expect(r.reason).toBe("hold_period_not_met");
  });
});

describe("evaluateGates — Crew active-player gates", () => {
  test("fraudFlagged refereeSnapshot → rejected (permanent)", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: OFF,
      refereeSnapshot: { fraudFlagged: true },
    });
    expect(r.decision).toBe("rejected");
    expect(r.reason).toBe("player_flagged");
  });

  test("account too young → pending (account_too_young)", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: { ...OFF, minAccountAgeDays: 7 },
      refereeSnapshot: { accountAgeDays: 3 },
    });
    expect(r.decision).toBe("pending");
    expect(r.reason).toBe("account_too_young");
  });

  test("account exactly old enough → passes", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: { ...OFF, minAccountAgeDays: 7 },
      refereeSnapshot: { accountAgeDays: 7 },
    });
    expect(r.decision).toBe("qualified");
  });

  test("missing accountAgeDays falls open (don't block on missing data)", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: { ...OFF, minAccountAgeDays: 7 },
      refereeSnapshot: { accountAgeDays: null },
    });
    expect(r.decision).toBe("qualified");
  });

  test("minActiveDeposits not met → pending", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: { ...OFF, minActiveDeposits: 3 },
      refereeSnapshot: { depositsCount: 2 },
    });
    expect(r.decision).toBe("pending");
    expect(r.reason).toBe("deposit_count_too_low");
  });

  test("minActiveDeposits met → passes", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: { ...OFF, minActiveDeposits: 3 },
      refereeSnapshot: { depositsCount: 3 },
    });
    expect(r.decision).toBe("qualified");
  });

  test("requirePositiveNgr with non-positive NGR → pending", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: { ...OFF, requirePositiveNgr: true },
      refereeSnapshot: { lifetimeNgrCents: 0 },
    });
    expect(r.decision).toBe("pending");
    expect(r.reason).toBe("ngr_not_positive");

    const r2 = evaluateGates({
      ...ftdEvent,
      gates: { ...OFF, requirePositiveNgr: true },
      refereeSnapshot: { lifetimeNgrCents: -50 },
    });
    expect(r2.decision).toBe("pending");
  });

  test("requirePositiveNgr with positive NGR → passes", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: { ...OFF, requirePositiveNgr: true },
      refereeSnapshot: { lifetimeNgrCents: 1 },
    });
    expect(r.decision).toBe("qualified");
  });

  test("all Crew gates set + snapshot clears all → qualified", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: {
        ...OFF,
        minDepositCents: 1000,
        holdDays: 7,
        minActiveDeposits: 3,
        minAccountAgeDays: 7,
        requirePositiveNgr: true,
      },
      refereeSnapshot: {
        depositsCount: 5,
        accountAgeDays: 30,
        lifetimeNgrCents: 250_000,
        fraudFlagged: false,
      },
    });
    expect(r.decision).toBe("qualified");
  });

  test("priority: fraud beats account age — rejected wins over pending", () => {
    const r = evaluateGates({
      ...ftdEvent,
      gates: { ...OFF, minAccountAgeDays: 7 },
      refereeSnapshot: { accountAgeDays: 2, fraudFlagged: true },
    });
    expect(r.decision).toBe("rejected");
    expect(r.reason).toBe("player_flagged");
  });
});
