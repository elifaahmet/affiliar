"use strict";

// An affiliate's tracking link must point at the casino. When the base URL was
// missing the portal quietly fell back to Affiliar's own origin, producing
// links like https://app.affiliar.co/?affiliate=CODE that look valid and get
// published — every click lost. These tests pin where the base comes from.

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || "a".repeat(64);

const mockUserFindById = jest.fn();
const mockBrandFind = jest.fn();

const lean = (value) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

jest.mock("../models/User", () => ({ findById: (...a) => mockUserFindById(...a) }));
jest.mock("../models/Brand", () => ({ find: (...a) => mockBrandFind(...a) }));

const { _internals } = require("../controllers/affiliate/affiliatePortalController");
const { buildBrandCodes } = _internals;

const OPERATOR_USER = "op-user-1";
const BRAND = { _id: "brand-1", name: "Betamericano", url: "https://betamericano.com" };

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFindById.mockReturnValue(lean({ operatorId: "operator-1" }));
  mockBrandFind.mockReturnValue(lean([BRAND]));
});

describe("affiliate link base", () => {
  test("per-brand codes carry their own brand's URL", async () => {
    mockBrandFind.mockReturnValue(lean([BRAND]));
    const out = await buildBrandCodes({
      brandCodes: [{ code: "ABC123", brandId: "brand-1" }],
    });
    expect(out).toEqual([
      { code: "ABC123", brandId: "brand-1", brandName: "Betamericano", brandUrl: "https://betamericano.com" },
    ]);
  });

  test("a legacy code resolves the operator's brand when there is only one", async () => {
    const out = await buildBrandCodes({
      referralCodes: ["PNFBWMPW"],
      operatorUser: OPERATOR_USER,
    });

    expect(out).toHaveLength(1);
    expect(out[0].code).toBe("PNFBWMPW");
    // The whole point: this used to be null, and the portal filled the gap
    // with its own origin.
    expect(out[0].brandUrl).toBe("https://betamericano.com");
    expect(out[0].brandName).toBe("Betamericano");
  });

  test("with several brands a legacy code stays unresolved rather than guessing", async () => {
    mockBrandFind.mockReturnValue(
      lean([BRAND, { _id: "brand-2", name: "Other", url: "https://other.example" }]),
    );

    const out = await buildBrandCodes({
      referralCodes: ["PNFBWMPW"],
      operatorUser: OPERATOR_USER,
    });

    // Sending a code to the wrong casino is worse than showing no link.
    expect(out[0].brandUrl).toBeNull();
    expect(out[0].brandId).toBeNull();
  });

  test("a brand with no URL on file yields null, never a placeholder", async () => {
    mockBrandFind.mockReturnValue(lean([{ ...BRAND, url: null }]));
    const out = await buildBrandCodes({
      referralCodes: ["PNFBWMPW"],
      operatorUser: OPERATOR_USER,
    });
    expect(out[0].brandUrl).toBeNull();
  });

  test("an unattached legacy profile resolves nothing", async () => {
    const out = await buildBrandCodes({ referralCodes: ["PNFBWMPW"], operatorUser: null });
    expect(out[0].brandUrl).toBeNull();
    expect(mockUserFindById).not.toHaveBeenCalled();
  });

  test("no codes at all yields an empty list", async () => {
    await expect(buildBrandCodes({ referralCodes: [], brandCodes: [] })).resolves.toEqual([]);
    await expect(buildBrandCodes(null)).resolves.toEqual([]);
  });
});
