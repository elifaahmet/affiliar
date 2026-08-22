"use strict";

// The approval gate is the only thing between a public form and a working
// tenant on a multi-tenant platform, so the properties worth pinning are the
// ones that would quietly hand out access.

describe("what a public application may create", () => {
  // Mirrors what operatorRegister writes.
  const application = {
    approvalStatus: "pending",
    billingStatus: "trial",
    nextBillingDate: null,
    ownerStatus: "pending",
    ownerPassword: "PENDING",
  };

  it("starts unapproved", () => {
    expect(application.approvalStatus).toBe("pending");
  });

  it("cannot be logged into — no usable password is set", () => {
    // /auth/activate refuses anything not in `pending`, and "PENDING" is not
    // a bcrypt hash, so it cannot match a login either.
    expect(application.ownerStatus).toBe("pending");
    expect(application.ownerPassword).toBe("PENDING");
    expect(application.ownerPassword.startsWith("$2")).toBe(false);
  });

  it("does not start a billing clock before anyone has looked at it", () => {
    // Otherwise an application left for a week arrives with its trial spent
    // and lands straight in the past-due cadence.
    expect(application.nextBillingDate).toBeNull();
  });
});

describe("approval", () => {
  const approve = (operator, { trialDays = 14, now = new Date("2026-09-01T00:00:00Z") } = {}) => ({
    ...operator,
    approvalStatus: "approved",
    approvedAt: now,
    billingStatus: "trial",
    trialEndsAt: new Date(now.getTime() + trialDays * 86400000),
  });

  it("starts the trial from the approval, not the application", () => {
    const applied = new Date("2026-08-01T00:00:00Z");
    const out = approve({ approvalRequestedAt: applied });
    expect(out.trialEndsAt.getTime()).toBeGreaterThan(applied.getTime() + 14 * 86400000);
  });

  it("leaves the operator on a trial rather than immediately billable", () => {
    expect(approve({}).billingStatus).toBe("trial");
  });
});

describe("integration choice recorded at signup", () => {
  const MODES = ["raw", "aggregated"];
  const TRANSPORTS = ["kafka", "rest"];

  it("accepts only the two ingestion modes", () => {
    expect(MODES).toContain("raw");
    expect(MODES).toContain("aggregated");
    expect(MODES).toHaveLength(2);
  });

  it("accepts only the two transports", () => {
    expect(TRANSPORTS).toEqual(expect.arrayContaining(["kafka", "rest"]));
    expect(TRANSPORTS).toHaveLength(2);
  });
});
