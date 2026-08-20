"use strict";

// Access-control logic for suspended tenants. Worth pinning down: the
// affiliate allowlist is prefix-based, and a sloppy prefix match would hand
// out every route that merely *starts* with an allowed one.

jest.mock("../models/Operator", () => ({ findById: jest.fn() }));

const Operator = require("../models/Operator");
const { blockSuspendedOperator } = require("../middlewares/billingGate");

function mockOperator(doc) {
  Operator.findById.mockReturnValue({
    select: () => ({ lean: async () => doc }),
  });
}

// Runs the middleware and reports whether the request got through.
async function run(role, path, operatorDoc) {
  mockOperator(operatorDoc);
  const req = { affiliateUser: { role, operatorId: "op1" }, path };
  let blocked = null;
  const res = {
    status: (code) => ({
      json: (body) => {
        blocked = { code, body };
      },
    }),
  };
  let nexted = false;
  await blockSuspendedOperator(req, res, () => {
    nexted = true;
  });
  return { allowed: nexted && !blocked, blocked };
}

const SUSPENDED = { billingStatus: "suspended", lifetimeFree: false, name: "Betroxy" };
const ACTIVE    = { billingStatus: "active",    lifetimeFree: false, name: "Betroxy" };

beforeEach(() => Operator.findById.mockReset());

describe("suspended operator", () => {
  it("keeps login, billing and admin reachable", async () => {
    for (const p of ["/auth/login", "/billing/status", "/admin/operators"]) {
      expect((await run("operator", p, SUSPENDED)).allowed).toBe(true);
    }
  });

  it("blocks the rest of the panel", async () => {
    const { allowed, blocked } = await run("operator", "/affiliate-portal/overview", SUSPENDED);
    expect(allowed).toBe(false);
    expect(blocked.code).toBe(402);
    expect(blocked.body.reason).toBe("operator_unpaid");
  });
});

describe("affiliate of a suspended operator", () => {
  it("still sees the money they are owed", async () => {
    const earnings = [
      "/affiliate-portal/payout-balance",
      "/affiliate-portal/payout-info",
      "/affiliate-portal/payouts",
      "/affiliate-portal/account-status",
      "/auth/login",
    ];
    for (const p of earnings) {
      expect((await run("affiliate", p, SUSPENDED)).allowed).toBe(true);
    }
  });

  it("loses the rest of the product", async () => {
    const gated = [
      "/affiliate-portal/overview",
      "/affiliate-portal/links",
      "/affiliate-portal/commission",
      "/affiliate-portal/creatives",
      "/affiliate-portal/profile",
    ];
    for (const p of gated) {
      const { allowed, blocked } = await run("affiliate", p, SUSPENDED);
      expect(allowed).toBe(false);
      expect(blocked.code).toBe(402);
    }
  });

  it("does not leak a route that merely shares an allowed prefix", async () => {
    const { allowed } = await run("affiliate", "/affiliate-portal/payout-balance-secret", SUSPENDED);
    expect(allowed).toBe(false);
  });

  it("names the operator so the UI can say who owes", async () => {
    const { blocked } = await run("affiliate", "/affiliate-portal/overview", SUSPENDED);
    expect(blocked.body.operatorName).toBe("Betroxy");
  });
});

describe("not suspended", () => {
  it("lets everyone through when billing is current", async () => {
    expect((await run("affiliate", "/affiliate-portal/overview", ACTIVE)).allowed).toBe(true);
    expect((await run("operator",  "/affiliate-portal/overview", ACTIVE)).allowed).toBe(true);
  });

  it("never blocks a lifetime-free tenant", async () => {
    const free = { billingStatus: "suspended", lifetimeFree: true, name: "Hexora" };
    expect((await run("affiliate", "/affiliate-portal/overview", free)).allowed).toBe(true);
    expect((await run("operator",  "/affiliate-portal/overview", free)).allowed).toBe(true);
  });
});
