"use strict";

// This helper failed in the quietest way available: decrypt() returned the
// ciphertext unchanged instead of throwing, because the prefix contains a ':'
// and splitting the whole string shifted every field by one. Anything relying
// on it would have stored and compared ciphertext without a single error.

process.env.DATA_ENCRYPTION_KEY = "test-key-that-is-long-enough-for-sha256-derivation";
const { encrypt, decrypt, ENCRYPTION_PREFIX } = require("../utils/fieldEncryption");

describe("round trip", () => {
  it.each([
    ["json", '{"apiKey":"abc","secret":"def"}'],
    ["plain text", "hello"],
    ["value containing colons", "enc:looking:value"],
    ["empty string", ""],
    ["long value", "x".repeat(5000)],
  ])("recovers %s exactly", (_label, value) => {
    expect(decrypt(encrypt(value))).toBe(value);
  });
});

describe("ciphertext", () => {
  it("does not contain the plaintext", () => {
    const secret = "super-secret-kafka-password";
    expect(encrypt(secret)).not.toContain(secret);
  });

  it("differs each time, so equal values are not linkable", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("carries the version prefix", () => {
    expect(encrypt("x").startsWith(ENCRYPTION_PREFIX)).toBe(true);
  });
});

describe("pass-through", () => {
  it("leaves values that were never encrypted alone", () => {
    expect(decrypt("plain")).toBe("plain");
    expect(decrypt(null)).toBeNull();
    expect(decrypt(undefined)).toBeUndefined();
  });

  it("returns a malformed payload rather than throwing", () => {
    // Truncated or hand-edited values shouldn't crash a request path.
    expect(decrypt(ENCRYPTION_PREFIX + "onlyonepart")).toBe(ENCRYPTION_PREFIX + "onlyonepart");
  });
});
