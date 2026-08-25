"use strict";

// An affiliate's tracking link is built on their brand's website URL. Inviting
// someone before that URL exists hands them a portal with a code and no usable
// link, which is how three live affiliates ended up publishing links that
// pointed at our own panel. The invite refuses instead.

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || "a".repeat(64);

const mockBrandFind = jest.fn();
const mockUserFindOne = jest.fn();

jest.mock("../models/Brand", () => ({ find: (...a) => mockBrandFind(...a) }));
jest.mock("../models/User", () => ({
  find: jest.fn(), findOne: (...a) => mockUserFindOne(...a), create: jest.fn(),
}));
jest.mock("../models/AffiliateProfile", () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock("../utils/mailer", () => ({ sendAffiliateInvite: jest.fn(), sendPasswordReset: jest.fn() }));

const ctrl = require("../controllers/affiliate/affiliateController");

const OPERATOR = { _id: "u1", role: "operator", operatorId: "op1" };
const withUrl    = { _id: "b1", name: "Betamericano", url: "https://betamericano.com", enabled: true };
const withoutUrl = { _id: "b2", name: "Betroxy",      url: null,                        enabled: true };

const BODY = { email: "new@aff.test", username: "newaff", name: "New Affiliate" };

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const brandsAre = (list) => mockBrandFind.mockReturnValue({ lean: () => Promise.resolve(list) });

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFindOne.mockResolvedValue(null); // email/username free
});

describe("inviting an affiliate requires a brand URL", () => {
  test("refuses when the assigned brand has no URL", async () => {
    brandsAre([withoutUrl]);
    const res = mockRes();

    await ctrl.create({ affiliateUser: OPERATOR, body: BODY }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe("BRAND_URL_REQUIRED");
    // Name the brand — an operator with several shouldn't have to guess.
    expect(payload.error).toContain("Betroxy");
    expect(payload.brands).toEqual(["b2"]);
  });

  test("names every brand that's missing one, not just the first", async () => {
    brandsAre([withoutUrl, { _id: "b3", name: "Another", url: "   ", enabled: true }]);
    const res = mockRes();

    await ctrl.create({ affiliateUser: OPERATOR, body: BODY }, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toContain("Betroxy");
    expect(payload.error).toContain("Another");   // whitespace is not a URL
    expect(payload.brands).toEqual(["b2", "b3"]);
  });

  test("only the brands actually being assigned have to have one", async () => {
    // The operator still has an unconfigured brand, but this affiliate isn't
    // getting it, so it can't affect their links.
    brandsAre([withUrl, withoutUrl]);
    const res = mockRes();

    await ctrl.create({ affiliateUser: OPERATOR, body: { ...BODY, brandIds: ["b1"] } }, res);

    const status = res.status.mock.calls[0][0];
    expect(status).not.toBe(400);
  });

  test("passes the precondition when the brand has a URL", async () => {
    brandsAre([withUrl]);
    const res = mockRes();

    await ctrl.create({ affiliateUser: OPERATOR, body: BODY }, res);

    const payload = res.json.mock.calls[0][0] ?? {};
    expect(payload.code).not.toBe("BRAND_URL_REQUIRED");
  });

  test("the older no-brands-at-all guard still fires first", async () => {
    brandsAre([]);
    const res = mockRes();

    await ctrl.create({ affiliateUser: OPERATOR, body: BODY }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/at least one brand/i);
  });
});
