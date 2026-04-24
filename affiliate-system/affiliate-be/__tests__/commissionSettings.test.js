"use strict";

const { resolveCommissionSettings, HARD_DEFAULTS } = require("../engine/commissionSettings");

describe("resolveCommissionSettings — inherit hierarchy", () => {
  test("empty plan + empty operator → hard defaults", () => {
    const out = resolveCommissionSettings({}, {});
    expect(out).toEqual({ ...HARD_DEFAULTS });
  });

  test("operator default overrides hard default when plan leaves field null", () => {
    const out = resolveCommissionSettings(
      { revshare: { metric: null, includePaymentFees: null } },
      { revshareMetric: "ggr", ngrIncludesPaymentFees: false, depositBasis: "net" },
    );
    expect(out.revshareMetric).toBe("ggr");
    expect(out.ngrIncludesPaymentFees).toBe(false);
    expect(out.depositBasis).toBe("net");
  });

  test("plan explicit value overrides operator default", () => {
    const out = resolveCommissionSettings(
      {
        revshare: { metric: "ngr", includePaymentFees: true },
        cpa: { qualification: { depositBasis: "gross" } },
      },
      { revshareMetric: "ggr", ngrIncludesPaymentFees: false, depositBasis: "net" },
    );
    expect(out.revshareMetric).toBe("ngr");
    expect(out.ngrIncludesPaymentFees).toBe(true);
    expect(out.depositBasis).toBe("gross");
  });

  test("plan.includePaymentFees=false (explicit) beats operator.ngrIncludesPaymentFees=true", () => {
    // Specifically guard: boolean false must NOT fall through to the next
    // level just because it's falsy. Only null/undefined inherits.
    const out = resolveCommissionSettings(
      { revshare: { includePaymentFees: false } },
      { ngrIncludesPaymentFees: true },
    );
    expect(out.ngrIncludesPaymentFees).toBe(false);
  });

  test("missing subobjects don't crash", () => {
    expect(() => resolveCommissionSettings(null, null)).not.toThrow();
    expect(() => resolveCommissionSettings(undefined, undefined)).not.toThrow();
  });
});
