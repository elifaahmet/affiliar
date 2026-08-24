// Stripe-style webhook signing for outbound reward events.
// The wire format is fixed by docs/refer-a-friend/WEBHOOK.md §3 — operators
// have already coded verifiers against it, so treat it as a contract:
//
//   X-Affiliar-Signature: t=<unix-seconds>,v1=<hex>[,v1=<hex>...]
//
// The signed string is `<timestamp>.<raw-body>`, HMAC-SHA256, hex digest.
// Signing the timestamp alongside the body is what makes the receiver's
// 5-minute freshness check meaningful: an attacker replaying a captured
// request can't move `t` forward without invalidating the digest.

const crypto = require("crypto");
const { decrypt } = require("./fieldEncryption");

// How long a rotated-out secret keeps signing. Covers the full retry ladder
// (1m…24h, jobs/rewardCallbackJob) with room to spare, so a rotation mid-flight
// never strands a delivery that the receiver would otherwise accept.
const ROTATION_GRACE_MS = 48 * 60 * 60 * 1000;

/** Secrets still valid for signing: the active head plus recently retired ones. */
function liveSecrets(entries, now = new Date()) {
  return (entries || []).filter(
    (e) => !e.retiredAt || now - new Date(e.retiredAt) < ROTATION_GRACE_MS,
  );
}

/**
 * Build the X-Affiliar-Signature header value.
 *
 * Emits one `v1=` per live secret. During a rotation window that means two
 * digests in one header — the receiver accepts the request if ANY matches,
 * which is what lets an operator swap secrets without a coordinated deploy.
 *
 * @param {string} rawBody      exact bytes that will be POSTed
 * @param {Array}  secretEntries `webhook.secrets` (encrypted at rest)
 * @param {number} timestampSec unix seconds; also sent as X-Affiliar-Timestamp
 * @returns {string} e.g. "t=1746611820,v1=5257a8…,v1=8d4cf3…"
 */
function buildSignature(rawBody, secretEntries, timestampSec) {
  const signed = `${timestampSec}.${rawBody}`;
  const digests = liveSecrets(secretEntries)
    .map((e) => {
      const plain = decrypt(e.secret);
      if (!plain) return null;
      return crypto.createHmac("sha256", plain).update(signed, "utf8").digest("hex");
    })
    .filter(Boolean);

  return [`t=${timestampSec}`, ...digests.map((d) => `v1=${d}`)].join(",");
}

/**
 * Mint a new webhook secret. Returned in plaintext exactly once — the caller
 * shows it to the operator and stores only the encrypted form.
 */
function generateSecret() {
  // `whsec_` prefix so a leaked string is greppable and obviously ours.
  const plain = `whsec_${crypto.randomBytes(32).toString("hex")}`;
  return { plain, hint: plain.slice(-4) };
}

module.exports = { buildSignature, generateSecret, liveSecrets, ROTATION_GRACE_MS };
