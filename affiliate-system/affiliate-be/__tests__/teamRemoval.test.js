"use strict";

// Removing team members is destructive and permission-sensitive, and the rule
// that matters is easy to get wrong in either direction: too strict and an
// operator can never clean up its own team, too loose and it can delete its
// last owner and lock itself out entirely.

const OWNER = { brandIds: [] };
const SCOPED = { brandIds: ["b1"] };

// Mirrors isOwner() in operatorController: owner-level means no brand scoping.
const isOwner = (u) => !(u.brandIds && u.brandIds.length);

describe("ownership is derived from brand scoping", () => {
  it("treats an unscoped account as owner-level", () => {
    expect(isOwner(OWNER)).toBe(true);
    expect(isOwner({})).toBe(true);
  });

  it("treats a brand-scoped account as a member", () => {
    expect(isOwner(SCOPED)).toBe(false);
  });
});

describe("last-owner rule", () => {
  // What removeTeamMember enforces: an owner may be removed only while
  // another owner-level account survives.
  const canRemove = (target, others) =>
    !isOwner(target) || others.filter(isOwner).length > 0;

  it("allows removing an owner while another owner remains", () => {
    expect(canRemove(OWNER, [OWNER, SCOPED])).toBe(true);
  });

  it("blocks removing the only owner", () => {
    expect(canRemove(OWNER, [SCOPED, SCOPED])).toBe(false);
    expect(canRemove(OWNER, [])).toBe(false);
  });

  it("never blocks removing a scoped member, even as the only one left", () => {
    expect(canRemove(SCOPED, [])).toBe(true);
  });
});
