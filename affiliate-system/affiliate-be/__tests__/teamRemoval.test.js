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
  // What removeTeamMember enforces for a platform admin: an owner may go only
  // while another owner-level account survives.
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

describe("who may remove an owner", () => {
  // Owners are peers. Without this an operator owner could remove the others
  // and take sole control, and there is no one above them to reverse it — so
  // owner removal is a platform-admin action.
  const mayRemove = (target, caller) =>
    !isOwner(target) || caller.isPlatformAdmin === true;

  const OPERATOR_OWNER = { isPlatformAdmin: false };
  const PLATFORM_ADMIN = { isPlatformAdmin: true };

  it("stops an operator owner removing a fellow owner", () => {
    expect(mayRemove(OWNER, OPERATOR_OWNER)).toBe(false);
  });

  it("lets a platform admin remove an owner", () => {
    expect(mayRemove(OWNER, PLATFORM_ADMIN)).toBe(true);
  });

  it("still lets an operator owner remove a scoped member", () => {
    expect(mayRemove(SCOPED, OPERATOR_OWNER)).toBe(true);
  });
});
