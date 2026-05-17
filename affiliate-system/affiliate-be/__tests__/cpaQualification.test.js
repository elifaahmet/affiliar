"use strict";

const { checkCpaQualification } = require("../engine/cpaQualification");

// Helper to build a realistic FTD row. Defaults assume the player has
// already deposited generously and wagered plenty — every individual test
// flips one dimension to isolate the gate under test.
const ftd = (overrides = {}) => ({
  playerId:              "p1",
  ftdDate:               new Date("2026-04-01T00:00:00.000Z"),
  depositCents:          10_000, // $100
  depositFeeCents:       300,    // $3 fee (3%)
  wagerSinceFtdCents:    100_000,
  cashoutsSinceFtdCents: 0,
  depositsTotalCents:    10_000,
  cashoutsTotalCents:    0,
  ...overrides,
});

const GATES_OFF = {
  depositBasis: "gross",
  minDepositCents: null,
  minWagerMultiple: null,
  minWagerCents: null,
  holdDays: null,
  minCashRetentionCents: null,
  minKycLevel: null,
};

describe("checkCpaQualification", () => {
  test("no gates active → every FTD qualifies", () => {
    const result = checkCpaQualification([ftd(), ftd({ playerId: "p2" })], GATES_OFF);
    expect(result.qualified).toBe(2);
    expect(result.pending).toBe(0);
    expect(result.rejected).toBe(0);
  });

  // ── Min deposit — rejected (permanent) ───────────────────────────────────

  test("minDepositCents: deposit below threshold → rejected", () => {
    const result = checkCpaQualification(
      [ftd({ depositCents: 500 })], // $5 deposit, below $10 minimum
      { ...GATES_OFF, minDepositCents: 1_000 },
    );
    expect(result.rejected).toBe(1);
    expect(result.rejectedFtds[0].reason).toBe("deposit_below_min");
  });

  test("minDepositCents: deposit exactly at threshold → qualifies", () => {
    const result = checkCpaQualification(
      [ftd({ depositCents: 1_000 })],
      { ...GATES_OFF, minDepositCents: 1_000 },
    );
    expect(result.qualified).toBe(1);
  });

  test("depositBasis=net: rejection uses deposit after fees", () => {
    // Gross deposit = $100, fee = $3 → net = $97. Threshold = $100 → rejected.
    const result = checkCpaQualification(
      [ftd({ depositCents: 10_000, depositFeeCents: 300 })],
      { ...GATES_OFF, depositBasis: "net", minDepositCents: 10_000 },
    );
    expect(result.rejected).toBe(1);
  });

  // ── Hold period — pending (time-based) ───────────────────────────────────

  test("holdDays: FTD too recent → pending", () => {
    const now = new Date("2026-04-05T00:00:00.000Z");
    const result = checkCpaQualification(
      [ftd({ ftdDate: new Date("2026-04-01T00:00:00.000Z") })], // 4 days old
      { ...GATES_OFF, holdDays: 7 },
      now,
    );
    expect(result.pending).toBe(1);
    expect(result.pendingFtds[0].reason).toBe("hold_period_not_met");
  });

  test("holdDays: FTD older than threshold → qualifies", () => {
    const now = new Date("2026-04-10T00:00:00.000Z");
    const result = checkCpaQualification(
      [ftd({ ftdDate: new Date("2026-04-01T00:00:00.000Z") })],
      { ...GATES_OFF, holdDays: 7 },
      now,
    );
    expect(result.qualified).toBe(1);
  });

  // ── Min wager — pending (activity-based) ─────────────────────────────────

  test("minWagerCents: flat floor not met → pending", () => {
    const result = checkCpaQualification(
      [ftd({ wagerSinceFtdCents: 5_000 })],
      { ...GATES_OFF, minWagerCents: 10_000 },
    );
    expect(result.pending).toBe(1);
    expect(result.pendingFtds[0].reason).toBe("wager_below_min");
  });

  test("minWagerMultiple: player wagered less than N× deposit → pending", () => {
    // deposit=$100, multiple=3 → must wager $300. Player wagered $200.
    const result = checkCpaQualification(
      [ftd({ depositCents: 10_000, wagerSinceFtdCents: 20_000 })],
      { ...GATES_OFF, minWagerMultiple: 3 },
    );
    expect(result.pending).toBe(1);
  });

  test("both min wager gates: effective floor is max of the two", () => {
    // flat=$100, multiple=3×$50=$150 → effective=$150. Player wagered $120.
    const result = checkCpaQualification(
      [ftd({ depositCents: 5_000, wagerSinceFtdCents: 12_000 })],
      { ...GATES_OFF, minWagerCents: 10_000, minWagerMultiple: 3 },
    );
    expect(result.pending).toBe(1);
  });

  test("min wager met → qualifies", () => {
    const result = checkCpaQualification(
      [ftd({ depositCents: 10_000, wagerSinceFtdCents: 40_000 })],
      { ...GATES_OFF, minWagerMultiple: 3 },
    );
    expect(result.qualified).toBe(1);
  });

  // ── Cash retention — pending (catches withdraw-before-play fraud) ────────

  test("minCashRetentionCents: net cash below threshold → pending", () => {
    // Player deposited $100, cashed out $90 → $10 retained, below $20 floor.
    const result = checkCpaQualification(
      [ftd({ depositsTotalCents: 10_000, cashoutsTotalCents: 9_000 })],
      { ...GATES_OFF, minCashRetentionCents: 2_000 },
    );
    expect(result.pending).toBe(1);
    expect(result.pendingFtds[0].reason).toBe("cash_retention_below_min");
  });

  test("minCashRetentionCents: negative net cash → still pending, not rejected", () => {
    // Deposit-then-withdraw attack. The FTD can still recover on a later
    // recalc if the player deposits more, so it's pending, not rejected.
    const result = checkCpaQualification(
      [ftd({ depositsTotalCents: 10_000, cashoutsTotalCents: 15_000 })],
      { ...GATES_OFF, minCashRetentionCents: 0 }, // 0 means "no floor" — should pass
    );
    expect(result.qualified).toBe(1);
  });

  // ── Priority: deposit rejection short-circuits everything ────────────────

  test("rejection short-circuits hold / wager checks", () => {
    // Deposit is too small → rejected. Even though hold + wager are also
    // failing, the bucket should be rejected (permanent) not pending.
    const now = new Date("2026-04-02T00:00:00.000Z");
    const result = checkCpaQualification(
      [
        ftd({
          depositCents: 500, // rejected
          ftdDate: new Date("2026-04-01T00:00:00.000Z"), // too recent
          wagerSinceFtdCents: 0, // no wager
        }),
      ],
      { ...GATES_OFF, minDepositCents: 1_000, holdDays: 7, minWagerMultiple: 3 },
      now,
    );
    expect(result.rejected).toBe(1);
    expect(result.pending).toBe(0);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  test("empty ftd list → zero counts", () => {
    const result = checkCpaQualification([], { ...GATES_OFF, minDepositCents: 1_000 });
    expect(result.qualified).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.rejected).toBe(0);
  });

  test("gate value 0 behaves like null (disabled)", () => {
    // A 0 minimum shouldn't effectively block anything — matches the
    // resolver's HARD_DEFAULTS=null semantics.
    const result = checkCpaQualification(
      [ftd({ depositCents: 0 })],
      { ...GATES_OFF, minDepositCents: 0 },
    );
    expect(result.qualified).toBe(1);
  });

  // ── Min KYC level — pending (player can level up later) ──────────────────

  test("minKycLevel: player below threshold → pending with kyc_below_min", () => {
    const result = checkCpaQualification(
      [ftd({ kycLevel: 1 })],
      { ...GATES_OFF, minKycLevel: 2 },
    );
    expect(result.pending).toBe(1);
    expect(result.pendingFtds[0].reason).toBe("kyc_below_min");
  });

  test("minKycLevel: player at threshold → qualifies", () => {
    const result = checkCpaQualification(
      [ftd({ kycLevel: 2 })],
      { ...GATES_OFF, minKycLevel: 2 },
    );
    expect(result.qualified).toBe(1);
  });

  test("minKycLevel: missing kycLevel on FTD defaults to 0 → pending", () => {
    const result = checkCpaQualification([ftd()], { ...GATES_OFF, minKycLevel: 1 });
    expect(result.pending).toBe(1);
    expect(result.pendingFtds[0].reason).toBe("kyc_below_min");
  });

  test("minKycLevel: 0 is an active gate (requires registered player) and still passes default-0 FTD", () => {
    // Unlike numeric thresholds where 0 ≡ disabled, minKycLevel=0 means
    // "any registered player passes" — the gate is explicitly active.
    const result = checkCpaQualification([ftd()], { ...GATES_OFF, minKycLevel: 0 });
    expect(result.qualified).toBe(1);
  });

  test("minKycLevel: null = gate disabled", () => {
    const result = checkCpaQualification(
      [ftd({ kycLevel: 0 })],
      { ...GATES_OFF, minKycLevel: null },
    );
    expect(result.qualified).toBe(1);
  });
});
