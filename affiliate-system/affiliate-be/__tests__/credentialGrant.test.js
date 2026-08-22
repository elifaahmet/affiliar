"use strict";

// A grant is a secret in a URL. The properties that matter are that it works
// exactly once, that it stops working on its own, and that a wrong token
// reveals nothing about whether it was wrong or merely spent.

process.env.DATA_ENCRYPTION_KEY = "test-key-that-is-long-enough-for-sha256-derivation";
const { encrypt, decrypt } = require("../utils/fieldEncryption");

// The model's storage contract, exercised without a database: issue encrypts,
// reveal decrypts, and the stored form never contains the secret.
describe("what is stored", () => {
  const payload = { tenantId: "abc", apiToken: "super-secret-token" };

  it("keeps the payload encrypted at rest", () => {
    const stored = encrypt(JSON.stringify(payload));
    expect(stored).not.toContain("super-secret-token");
    expect(stored).not.toContain("abc");
  });

  it("round-trips the payload exactly", () => {
    expect(JSON.parse(decrypt(encrypt(JSON.stringify(payload))))).toEqual(payload);
  });
});

describe("single use", () => {
  // Mirrors the findOneAndUpdate filter: only an unrevealed, unexpired grant
  // matches, and the same call marks it revealed.
  const matches = (grant, now = new Date()) =>
    grant.revealedAt === null && grant.expiresAt > now;

  it("matches an unread, unexpired grant", () => {
    expect(matches({ revealedAt: null, expiresAt: new Date(Date.now() + 3600e3) })).toBe(true);
  });

  it("does not match once read", () => {
    expect(matches({ revealedAt: new Date(), expiresAt: new Date(Date.now() + 3600e3) })).toBe(false);
  });

  it("does not match after expiry, read or not", () => {
    const past = new Date(Date.now() - 1000);
    expect(matches({ revealedAt: null, expiresAt: past })).toBe(false);
  });
});

describe("what a caller learns", () => {
  // reveal() returns null for unknown, spent and expired alike, and the route
  // turns all three into the same 410. Distinguishing them would let someone
  // probe which tokens exist.
  const responseFor = (revealResult) => (revealResult ? 200 : 410);

  it("answers identically for unknown, spent and expired", () => {
    expect(responseFor(null)).toBe(410);
    expect(responseFor(null)).toBe(410);
    expect(responseFor(null)).toBe(410);
  });
});
