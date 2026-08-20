"use strict";

// The key every session token is signed and verified with.
//
// This used to be the literal string "your_secret_key", copy-pasted into both
// authController.js and middlewares/auth.js. A published placeholder is not a
// secret: anyone who read the source could mint a token for any account,
// including a platform admin. The duplication was its own hazard too — change
// one and every session silently fails to verify against the other.
//
// Read once, here, so there is a single definition.
//
// Missing, this throws at require time rather than defaulting. An auth secret
// that quietly falls back is worse than a server that refuses to start: the
// fallback would be a value an attacker already knows, and nothing in the logs
// would say so.
const secret = process.env.JWT_SECRET;

if (!secret || secret.trim().length < 32) {
  throw new Error(
    "JWT_SECRET env var is required and must be at least 32 characters. " +
      "Generate one with: openssl rand -hex 32",
  );
}

module.exports = { SECRET_KEY: secret };
