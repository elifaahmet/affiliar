"use strict";

// A quarterly operator must be charged for the quarter and come due a quarter
// later. Getting either wrong is invisible until a customer is billed a third
// of what they owe, or chased two months early.

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || "a".repeat(64);

const mockResolve = jest.fn();
jest.mock("../models/DiscountCode", () => ({ resolve: (...a) => mockResolve(...a) }));
jest.mock("../models/Operator", () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock("../models/BillingTransaction", () => ({ find: jest.fn(), create: jest.fn() }));
jest.mock("../utils/mailer", () => ({
  sendBillingUpcoming: jest.fn(), sendBillingDueToday: jest.fn(),
  sendBillingPastDueReminder: jest.fn(), sendBillingSuspendedNotice: jest.fn(),
}));

const { _internals } = require("../controllers/affiliate/billingController");
const { resolvePlanAmount } = _internals;
const { PLAN_PRICES_USD } = require("../utils/planLimits");

const PRO = PLAN_PRICES_USD.pro;

beforeEach(() => jest.clearAllMocks());

describe("billing interval", () => {
  test("a monthly operator pays one month — the default is unchanged", async () => {
    const out = await resolvePlanAmount({ plan: "pro" });
    expect(out.amount).toBe(PRO);
    expect(out.intervalMonths).toBe(1);
  });

  test("a quarterly operator pays for three months", async () => {
    const out = await resolvePlanAmount({ plan: "pro", intervalMonths: 3 });
    expect(out.amount).toBe(PRO * 3);
    // The advertised monthly price is still reported, so the UI can show both.
    expect(out.planPrice).toBe(PRO);
  });

  test("an annual operator pays for twelve", async () => {
    const out = await resolvePlanAmount({ plan: "pro", intervalMonths: 12 });
    expect(out.amount).toBe(PRO * 12);
  });

  test("a fixed discount comes off each month, then scales", async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      code: { kind: "fixed_usd", amountUsd: 430, code: "DEAL" },
    });
    const out = await resolvePlanAmount({ plan: "pro", discountCode: "DEAL", intervalMonths: 3 });

    // $430 off each of three months — not $430 off the quarter as a whole.
    expect(out.amount).toBe((PRO - 430) * 3);
    // The per-month discount is reported unscaled, so an invoice can show it.
    expect(out.discountUsd).toBe(430);
  });

  test("a discount larger than the plan price can't produce a negative charge", async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      code: { kind: "fixed_usd", amountUsd: PRO * 5, code: "TOOBIG" },
    });
    const out = await resolvePlanAmount({ plan: "pro", discountCode: "TOOBIG", intervalMonths: 3 });
    expect(out.amount).toBe(0);
  });

  test("a nonsense multiplier falls back to one month rather than guessing", async () => {
    for (const bad of [0, -3, 2.5, null, undefined, NaN, "3"]) {
      const out = await resolvePlanAmount({ plan: "pro", intervalMonths: bad });
      expect(out.amount).toBe(PRO);
    }
  });

  test("an unknown plan is still rejected", async () => {
    await expect(resolvePlanAmount({ plan: "nope", intervalMonths: 3 })).rejects.toThrow(/Invalid plan/);
  });
});
